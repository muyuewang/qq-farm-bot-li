const assert = require('node:assert/strict');
const test = require('node:test');

const {
    STALL_GRACE_MS,
    LOOP_DELAY_WARN_MS,
    createStallProbe,
} = require('../dist/utils/stall-probe');

const INTERVAL = 60000;

// 用可控的墙钟/单调钟/ELU/延迟直方图/cgroup 计数喂探针，避免依赖真实定时器。
function harness(steps) {
    // 从 -1 起算：第一次 advance() 消费 steps[0]，对应探针内部的建基线 tick。
    let i = -1;
    const probe = createStallProbe({
        intervalMs: INTERVAL,
        now: () => steps[i].wall,
        mono: () => BigInt(steps[i].mono * 1e6),
        // 注入时按毫秒写，和 eventLoopUtilization 的增量单位一致
        elu: () => ({ idle: steps[i].idle, active: steps[i].active }),
        loopDelay: () => ({ maxMs: steps[i].loopMax, p99Ms: steps[i].loopP99 }),
        readCpuStat: () => `usage_usec 1\nnr_periods ${steps[i].nrPeriods || 0}\nthrottled_usec ${steps[i].throttledUs || 0}\nnr_throttled ${steps[i].nrThrottled || 0}\n`,
    });
    const advance = () => {
        i += 1;
        return probe.tick();
    };
    return { probe, advance };
}

function stepAt(wall, mono, extra = {}) {
    return { wall, mono, idle: 0, active: 0, loopMax: 0, loopP99: 0, ...extra };
}

test('第一个采样只建立基线，准时到达的采样不产生日志', () => {
    const { advance } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL, INTERVAL),
        stepAt(INTERVAL * 2, INTERVAL * 2),
    ]);
    assert.equal(advance(), null, '首次 tick 应当返回 null');
    assert.equal(advance(), null, '60.00s 准时 tick 不应报告');
    assert.equal(advance(), null, '连续准时 tick 不应报告');
});

test('墙钟迟到 23s 且什么都没跑：判定为进程未被调度', () => {
    const { advance } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL + 23154, INTERVAL + 23150, { active: 120, idle: 59000 }),
    ]);
    advance();
    const report = advance();
    assert.ok(report, '超过间隔+宽限必须报告');
    assert.equal(report.stalled, true);
    assert.equal(report.missedTicks, 1, '应当算作错过 1 个 tick');
    assert.match(report.cause, /进程未被调度/);
    // 墙钟与单调钟一起走 → 不是校时/挂起；活跃时间几乎为零 → 不是同步代码占住
    assert.ok(Math.abs(report.skewMs) < 1000, `钟差应保持在毫秒级，实际 ${report.skewMs}`);
});

test('墙钟比单调钟多走 23s：判定为时钟跳变或主机挂起', () => {
    const { advance } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL + 23154, INTERVAL, { active: 100, idle: 59000 }),
    ]);
    advance();
    const report = advance();
    assert.match(report.cause, /时钟跳变或主机挂起/);
    assert.equal(report.monoDeltaMs, INTERVAL);
});

test('停顿期间事件循环一直是活跃的：判定为同步代码占住', () => {
    const { advance } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL + 23000, INTERVAL + 23000, { active: 22000, idle: 1000 }),
    ]);
    advance();
    const report = advance();
    assert.match(report.cause, /事件循环被同步代码占住/);
    assert.equal(report.activeMs, 22000);
});

test('cgroup 限流计数在停顿期间涨了：判定为容器 CPU 配额被打满', () => {
    const { advance, probe } = harness([
        stepAt(0, 0, { throttledUs: 1000, nrThrottled: 1 }),
        stepAt(INTERVAL + 23000, INTERVAL + 23000, {
            active: 100, idle: 59000, throttledUs: 900000, nrThrottled: 12,
        }),
    ]);
    advance();
    const report = advance();
    assert.match(report.cause, /容器 CPU 配额被打满/);
    assert.equal(report.throttledUs, 899000, '应当取增量而不是累计值');
    assert.equal(report.nrThrottled, 11);
    assert.match(probe.format(report), /限流\+899ms\/11次/);
});

test('定时器没迟到，但事件循环出现过同步阻塞，仍然要报告', () => {
    const { advance } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL, INTERVAL, { active: 55000, idle: 5000, loopMax: LOOP_DELAY_WARN_MS + 1200, loopP99: 900 }),
    ]);
    advance();
    const report = advance();
    assert.ok(report, '延迟峰值超阈值就要报告，哪怕间隔正常');
    assert.equal(report.stalled, false);
    assert.equal(report.missedTicks, 0);
    assert.match(report.cause, /定时器没迟到/);
});

test('format 一行带上四个判定所需的量和内存水位', () => {
    const { advance, probe } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL + 23154, INTERVAL + 23100, { active: 200, idle: 59000, loopMax: 40, loopP99: 12 }),
    ]);
    advance();
    const report = advance();
    const line = probe.format(report);
    for (const field of ['wall=', 'mono=', '活跃=', '空闲=', 'loop延迟峰值=', '内存[rss=', '判定=']) {
        assert.ok(line.includes(field), `缺少字段 ${field}：${line}`);
    }
    assert.ok(line.includes('wall=83.2s'), line);
});

test('summary 累计全过程的停顿次数与最长一次，供掉线日志直接引用', () => {
    const { advance, probe } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL, INTERVAL, { active: 0, idle: 60000 }),
        stepAt(INTERVAL * 2 + 23000, INTERVAL * 2 + 23000, { active: 100, idle: 59000 }),
        stepAt(INTERVAL * 3 + 40000, INTERVAL * 3 + 40000, { active: 100, idle: 59000 }),
    ]);
    advance();
    assert.equal(probe.summary(), '未采样', '建立基线的那次 tick 不计入采样');
    advance();
    advance();
    advance();
    const text = probe.summary();
    assert.match(text, /采样3次/);
    assert.match(text, /停顿2次/);
    assert.match(text, /最长 wall=83s/, text, '最长一次是迟到 23s 的那次');
});

test('reset 重新起基线：重连留下的空档不会被算成这条连接的停顿', () => {
    const { advance, probe } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL, INTERVAL),
        stepAt(500000, 500000),
        stepAt(560000, 560000),
    ]);
    advance();
    assert.equal(advance(), null, '准时 tick 不报告');
    probe.reset();
    assert.equal(probe.summary(), '未采样', 'reset 之后累计计数归零');
    assert.equal(advance(), null, 'reset 后第一个 tick 只重建基线，440s 空档不算停顿');
    assert.equal(advance(), null, '之后的正常 tick 不报告');
    assert.match(probe.summary(), /停顿0次/);
});

test('宽限期以内的小抖动不算停顿', () => {
    const { advance } = harness([
        stepAt(0, 0),
        stepAt(INTERVAL + STALL_GRACE_MS - 100, INTERVAL + STALL_GRACE_MS - 100, { active: 100, idle: 60000 }),
    ]);
    advance();
    assert.equal(advance(), null);
});
