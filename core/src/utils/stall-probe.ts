export {};

/**
 * 计时器停顿探针（只读取证据，不参与任何调度、超时、重连判定）。
 *
 * 为什么需要：2026-09-22 那次 ws_close(1006) 掉线前，每分钟一条的 Gateway 流量采样里出现了
 * 唯一一个 83.15s 间隔（其余 453 个都是精确 60.00s）。也就是说有一个 setInterval 回调晚了 23 秒
 * 才跑，随后连接就被对端拆掉了。但"晚了 23 秒"至少有四种成因，光靠日志时间戳分不开：
 *
 *   1. 墙钟向前跳了（NTP 校时）或主机挂起过 —— 只有这种情况单调钟不会跟着走；
 *   2. 事件循环被同步代码占住（大回包解析、WASM 加解密）—— 进程一直在跑，活跃时间会涨；
 *   3. 容器 CPU 配额被打满被限流 —— cgroup 的 nr_throttled / throttled_usec 会涨；
 *   4. 进程压根没被调度（虚拟机热迁移、快照、宿主机抢占、cgroup freezer）—— 墙钟和单调钟一起走，
 *      但活跃时间、限流、事件循环延迟全都对不上。
 *
 * 所以每个 tick 同时取：墙钟差、单调钟差、事件循环利用率增量、事件循环延迟峰值、cgroup 限流增量、
 * 内存水位，再给一个判定。单次掉线就能定性，不用靠猜。
 *
 * 阈值只影响「要不要多打一行 warn 日志」，不影响任何业务行为。
 */

/** 墙钟间隔超过「期望间隔 + 这个余量」才算一次停顿。 */
const STALL_GRACE_MS = 5000;
/** 事件循环延迟峰值超过这个值就报告，用来抓没让定时器迟到的同步阻塞。 */
const LOOP_DELAY_WARN_MS = 3000;
/** 墙钟与单调钟差值的容忍带；超过即认为发生过校时或挂起。 */
const CLOCK_SKEW_WARN_MS = 2000;
const CGROUP_CPU_STAT_PATHS = ['/sys/fs/cgroup/cpu.stat', '/sys/fs/cgroup/cpu/cpu.stat'];

interface StallProbeOptions {
    intervalMs?: number;
    graceMs?: number;
    loopDelayWarnMs?: number;
    clockSkewWarnMs?: number;
    now?: () => number;
    mono?: () => bigint;
    elu?: () => { idle: number; active: number };
    loopDelay?: () => { maxMs: number; p99Ms: number };
    readCpuStat?: () => string;
}

interface StallReport {
    wallDeltaMs: number;
    monoDeltaMs: number;
    skewMs: number;
    activeMs: number;
    idleMs: number;
    loopDelayMaxMs: number;
    loopDelayP99Ms: number;
    throttledUs: number;
    nrThrottled: number;
    rssMb: number;
    heapUsedMb: number;
    missedTicks: number;
    stalled: boolean;
    cause: string;
}

function parseCpuStat(text: string): { nrThrottled: number; throttledUs: number } {
    const out = { nrThrottled: 0, throttledUs: 0 };
    for (const line of String(text || '').split('\n')) {
        const [key, value] = line.trim().split(/\s+/);
        if (key === 'nr_throttled') out.nrThrottled = Number(value) || 0;
        else if (key === 'throttled_usec') out.throttledUs = Number(value) || 0;
    }
    return out;
}

function readCgroupCpuStat(): string {
    const fs = require('node:fs');
    for (const file of CGROUP_CPU_STAT_PATHS) {
        try {
            if (fs.existsSync(file)) return String(fs.readFileSync(file, 'utf8'));
        } catch {}
    }
    return '';
}

function createStallProbe(options: StallProbeOptions = {}) {
    const intervalMs = Math.max(1000, Number(options.intervalMs) || 60000);
    const graceMs = Math.max(0, Number(options.graceMs ?? STALL_GRACE_MS));
    const loopDelayWarnMs = Math.max(0, Number(options.loopDelayWarnMs ?? LOOP_DELAY_WARN_MS));
    const clockSkewWarnMs = Math.max(0, Number(options.clockSkewWarnMs ?? CLOCK_SKEW_WARN_MS));
    const now = options.now || (() => Date.now());
    const mono = options.mono || (() => process.hrtime.bigint());
    const readCpuStat = options.readCpuStat || readCgroupCpuStat;

    // 事件循环利用率与延迟直方图都来自 perf_hooks；取不到就整体降级，不影响主流程。
    let perf: any = null;
    try {
        perf = require('perf_hooks');
    } catch {}
    // 注意：eventLoopUtilization 的 idle/active 增量单位是毫秒，不是微秒。
    let eluPrev: any = null;
    const elu = options.elu || (() => {
        if (!perf?.performance?.eventLoopUtilization) return { idle: 0, active: 0 };
        const delta = perf.performance.eventLoopUtilization(eluPrev);
        eluPrev = perf.performance.eventLoopUtilization();
        return { idle: Number(delta?.idle) || 0, active: Number(delta?.active) || 0 };
    });
    let delayHistogram: any = null;
    const loopDelay = options.loopDelay || (() => {
        if (!delayHistogram && perf?.monitorEventLoopDelay) {
            try {
                delayHistogram = perf.monitorEventLoopDelay({ resolution: 20 });
                delayHistogram.enable();
            } catch {
                delayHistogram = null;
            }
        }
        if (!delayHistogram) return { maxMs: 0, p99Ms: 0 };
        const maxMs = Number(delayHistogram.max) / 1e6;
        const p99Ms = Number(delayHistogram.percentile(99)) / 1e6;
        try { delayHistogram.reset(); } catch {}
        return { maxMs: Math.round(maxMs * 10) / 10, p99Ms: Math.round(p99Ms * 10) / 10 };
    });

    let lastWall = 0;
    let lastMono = BigInt(0);
    let lastCpu = { nrThrottled: 0, throttledUs: 0 };
    let primed = false;
    let tickCount = 0;
    let stallCount = 0;
    let worstDelayMs = 0;
    let worst: StallReport | null = null;

    function round1(v: number): number {
        return Math.round(v * 10) / 10;
    }

    function classify(report: StallReport, stallMs: number): string {
        if (report.skewMs > clockSkewWarnMs) {
            return `时钟跳变或主机挂起（墙钟比单调钟多走 ${round1(report.skewMs / 1000)}s，单调钟不计挂起时间）`;
        }
        if (!report.stalled) return `定时器没迟到，但事件循环出现过同步阻塞（峰值 ${round1(report.loopDelayMaxMs / 1000)}s）`;
        if (report.activeMs >= stallMs * 0.6) return `事件循环被同步代码占住（活跃 ${round1(report.activeMs / 1000)}s）`;
        if (report.throttledUs > 0) return `容器 CPU 配额被打满（限流 ${round1(report.throttledUs / 1000)}ms/${report.nrThrottled} 次）`;
        if (report.activeMs < stallMs * 0.2 && report.loopDelayMaxMs < loopDelayWarnMs) {
            return '进程未被调度（虚拟机热迁移/快照/宿主抢占/cgroup 冻结，这期间什么都没跑）';
        }
        return `停顿 ${round1(stallMs / 1000)}s，证据不足以定性`;
    }

    /**
     * 每个定时 tick 调一次。返回 null 表示这次正常（不打日志）；返回报告表示要补一行 warn。
     */
    function tick(): StallReport | null {
        const wall = now();
        const monoNow = mono();
        if (!primed) {
            primed = true;
            lastWall = wall;
            lastMono = monoNow;
            lastCpu = parseCpuStat(readCpuStat());
            // 先取一次样本丢掉：ELU 和延迟直方图不带基线时算的是「进程启动至今」，
            // 会让第一个停顿被误判成同步代码占住。
            elu();
            loopDelay();
            return null;
        }
        tickCount += 1;

        const wallDeltaMs = wall - lastWall;
        const monoDeltaMs = Number((monoNow - lastMono) / BigInt(1000000));
        lastWall = wall;
        lastMono = monoNow;

        const cpu = parseCpuStat(readCpuStat());
        const throttledUs = Math.max(0, cpu.throttledUs - lastCpu.throttledUs);
        const nrThrottled = Math.max(0, cpu.nrThrottled - lastCpu.nrThrottled);
        lastCpu = cpu;

        const eluDelta = elu();
        const delay = loopDelay();
        let mem = { rss: 0, heapUsed: 0 };
        try {
            mem = process.memoryUsage();
        } catch {}

        const stalled = wallDeltaMs > intervalMs + graceMs;
        const report: StallReport = {
            wallDeltaMs,
            monoDeltaMs,
            skewMs: wallDeltaMs - monoDeltaMs,
            activeMs: eluDelta.active,
            idleMs: eluDelta.idle,
            loopDelayMaxMs: delay.maxMs,
            loopDelayP99Ms: delay.p99Ms,
            throttledUs,
            nrThrottled,
            rssMb: Math.round(mem.rss / 1048576),
            heapUsedMb: Math.round(mem.heapUsed / 1048576),
            missedTicks: Math.max(0, Math.ceil(wallDeltaMs / intervalMs) - 1),
            stalled,
            cause: '',
        };
        if (stalled) {
            stallCount += 1;
            if (!worst || wallDeltaMs > worst.wallDeltaMs) worst = report;
        }
        worstDelayMs = Math.max(worstDelayMs, delay.maxMs);
        report.cause = classify(report, Math.max(0, wallDeltaMs - intervalMs));

        if (!report.stalled && report.loopDelayMaxMs < loopDelayWarnMs) return null;
        return report;
    }

    /**
     * 归零：丢掉当前基线，下一次 tick 重新起算，累计计数一并清空。
     * 新连接建立时调用，这样掉线日志里的「停顿N次」说的是这条连接，
     * 而不是把上一条连接断开到重连成功之间的空档也算进来。
     */
    function reset(): void {
        primed = false;
        tickCount = 0;
        stallCount = 0;
        worstDelayMs = 0;
        worst = null;
    }

    function format(report: StallReport): string {
        const parts = [
            `wall=${round1(report.wallDeltaMs / 1000)}s`,
            `mono=${round1(report.monoDeltaMs / 1000)}s`,
            `活跃=${round1(report.activeMs / 1000)}s`,
            `空闲=${round1(report.idleMs / 1000)}s`,
            `loop延迟峰值=${round1(report.loopDelayMaxMs / 1000)}s`,
        ];
        if (report.nrThrottled > 0 || report.throttledUs > 0) {
            parts.push(`限流+${round1(report.throttledUs / 1000)}ms/${report.nrThrottled}次`);
        }
        parts.push(`内存[rss=${report.rssMb}MB,heap=${report.heapUsedMb}MB]`);
        parts.push(`判定=${report.cause}`);
        return parts.join(' ');
    }

    /** 塞进掉线日志里，让每条掉线记录自带停顿归因，不用再去对时间戳。 */
    function summary(): string {
        if (!tickCount) return '未采样';
        const base = `采样${tickCount}次, 停顿${stallCount}次, loop延迟峰值=${round1(worstDelayMs / 1000)}s`;
        return worst
            ? `${base}; 最长 wall=${round1(worst.wallDeltaMs / 1000)}s mono=${round1(worst.monoDeltaMs / 1000)}s 判定=${worst.cause}`
            : base;
    }

    return { tick, reset, format, summary, stats: () => ({ tickCount, stallCount, worst }) };
}

module.exports = {
    STALL_GRACE_MS,
    LOOP_DELAY_WARN_MS,
    CLOCK_SKEW_WARN_MS,
    createStallProbe,
};
