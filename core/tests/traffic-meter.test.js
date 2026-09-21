const assert = require('node:assert/strict');
const test = require('node:test');

const {
    TRAFFIC_RETENTION_MS,
    createTrafficMeter,
} = require('../dist/utils/traffic-meter');

test('速率按秒分桶：峰值和均值分开，能看出突发', () => {
    const m = createTrafficMeter();
    const t0 = 1_700_000_000_000;
    // 同一个 1s 桶里发 24 个请求，然后停手
    for (let i = 0; i < 24; i++) m.recordOutbound('farm', 'Enter', t0);
    for (let i = 0; i < 6; i++) m.recordOutbound('friend', 'Leave', t0 + 3000);

    const s = m.snapshot(5000, t0 + 3000);
    assert.equal(s.outbound, 30);
    assert.equal(s.avgRps, 6);
    assert.equal(s.peakRps, 24, '单秒突发必须单独可见，不能被均值抹平');
    assert.equal(s.peakSec, Math.floor(t0 / 1000));
    assert.deepEqual(Object.fromEntries(s.byClass), { farm: 24, friend: 6 });
    assert.equal(s.topMethods[0][0], 'Enter');
});

test('入站区分回包和主动推送：链路是慢还是死要能看出来', () => {
    const m = createTrafficMeter();
    const t0 = 1_700_000_000_000;
    m.recordOutbound('critical', 'Heartbeat', t0);
    m.recordInbound('response', t0 + 50);
    m.recordInbound('push', t0 + 100);
    m.recordInbound('push', t0 + 200);

    const s = m.snapshot(1000, t0 + 200);
    assert.equal(s.outbound, 1);
    assert.equal(s.responseIn, 1);
    assert.equal(s.pushIn, 2, '只剩推送、回包为 0，就是服务端冻结 session 的形状');
});

test('窗口只统计请求的秒数，不吞掉环形缓冲区之外的历史', () => {
    const m = createTrafficMeter();
    const t0 = 1_700_000_000_000;
    m.recordOutbound('farm', 'AllLands', t0);
    m.recordOutbound('farm', 'AllLands', t0 + 60_000);

    assert.equal(m.snapshot(10_000, t0 + 60_000).outbound, 1, '60 秒前的请求不该算进 10 秒窗口');
    assert.equal(m.snapshot(120_000, t0 + 60_000).outbound, 2);

    // 超过保留时长后旧桶被覆盖：t0 那一秒的请求已经查不到了，只剩 t0+60s 和新的一条
    m.recordOutbound('farm', 'Bag', t0 + TRAFFIC_RETENTION_MS + 5000);
    assert.equal(m.snapshot(TRAFFIC_RETENTION_MS, t0 + TRAFFIC_RETENTION_MS + 5000).outbound, 2);
});

test('reset 清空记账，新连接不从上一条连接继承速率', () => {
    const m = createTrafficMeter();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) m.recordOutbound('farm', 'Enter', t0);
    m.reset(t0 + 1000);
    assert.equal(m.snapshot(60_000, t0 + 1000).outbound, 0);
    assert.equal(m.formatWindow(60_000, t0 + 1000).startsWith('rps=0 peak=0/s out=0'), true);
});

test('formatWindow 一行带齐取证字段', () => {
    const m = createTrafficMeter();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 12; i++) m.recordOutbound('farm', 'SellGoods', t0);
    m.recordInbound('push', t0 + 10);

    const line = m.formatWindow(10_000, t0 + 10);
    assert.match(line, /rps=1\.2 peak=12\/s out=12 in\(回包=0,推送=1\)/);
    assert.match(line, /班次\[farm:12\]/);
    assert.match(line, /方法\[SellGoodsx12\]/);
});
