"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Gateway 流量计数器（纯数据结构，不带定时器、不改变任何发送行为）。
 *
 * 为什么需要：现有的班次限制管的是「同时在途几个请求」，而服务端如果对我们的行为有意见，
 * 看的是「每秒收到几个请求」。这两件事在快速短请求下完全脱钩——in-flight 一直是 2~3，
 * 瞬时速率照样能到 20+/s。但日志里没有任何 per-request 记录，client_seq 只能从 5 秒节流
 * 的压力日志里采样，所以真实速率曲线一直是测不出来的。
 *
 * 这里按秒维护一个环形桶，记录出站请求（带班次和方法名）与入站帧（回包 / 主动推送），
 * 用来回答两个问题：掉线前那几十秒到底发了多少、服务端是完全不回还是只回推送。
 */
const TRAFFIC_BUCKET_MS = 1000;
const TRAFFIC_RETENTION_MS = 120000;
const TRAFFIC_TOP_METHODS = 6;
/** 定时流量日志的间隔。没有流量的窗口不打日志，避免空连接刷屏。 */
const TRAFFIC_STATS_LOG_INTERVAL_MS = 60000;
function emptyBucket(sec) {
    return { sec, outbound: 0, responseIn: 0, pushIn: 0, byClass: new Map(), byMethod: new Map() };
}
function mergeCount(target, key, delta) {
    target.set(key, (target.get(key) || 0) + delta);
}
function createTrafficMeter() {
    const bucketCount = Math.max(2, Math.ceil(TRAFFIC_RETENTION_MS / TRAFFIC_BUCKET_MS));
    const buckets = [];
    for (let i = 0; i < bucketCount; i++)
        buckets.push(emptyBucket(-1));
    function bucketFor(now) {
        const sec = Math.floor(now / TRAFFIC_BUCKET_MS);
        const slot = buckets[sec % bucketCount];
        if (slot.sec !== sec) {
            slot.sec = sec;
            slot.outbound = 0;
            slot.responseIn = 0;
            slot.pushIn = 0;
            slot.byClass.clear();
            slot.byMethod.clear();
        }
        return slot;
    }
    function bump(map, key) {
        map.set(key, (map.get(key) || 0) + 1);
    }
    function recordOutbound(requestClass, methodName, now = Date.now()) {
        const bucket = bucketFor(now);
        bucket.outbound += 1;
        bump(bucket.byClass, String(requestClass || 'foreground'));
        bump(bucket.byMethod, String(methodName || 'unknown'));
    }
    function recordInbound(kind, now = Date.now()) {
        const bucket = bucketFor(now);
        if (kind === 'push')
            bucket.pushIn += 1;
        else
            bucket.responseIn += 1;
    }
    /** 清零。新连接建立时调用，避免把上一条连接的速率算进来。 */
    function reset(now = Date.now()) {
        const sec = Math.floor(now / TRAFFIC_BUCKET_MS);
        for (const bucket of buckets) {
            bucket.sec = sec - bucketCount;
            bucket.outbound = 0;
            bucket.responseIn = 0;
            bucket.pushIn = 0;
            bucket.byClass.clear();
            bucket.byMethod.clear();
        }
    }
    function snapshot(windowMs, now = Date.now()) {
        const winSec = Math.max(1, Math.min(bucketCount, Math.ceil(Math.max(0, Number(windowMs) || 0) / TRAFFIC_BUCKET_MS)));
        const endSec = Math.floor(now / TRAFFIC_BUCKET_MS);
        const startSec = endSec - winSec + 1;
        const byClass = new Map();
        const byMethod = new Map();
        let outbound = 0;
        let responseIn = 0;
        let pushIn = 0;
        let peakRps = 0;
        let peakSec = 0;
        let coveredSec = 0;
        for (let sec = startSec; sec <= endSec; sec++) {
            const bucket = buckets[((sec % bucketCount) + bucketCount) % bucketCount];
            if (bucket.sec !== sec)
                continue;
            coveredSec += 1;
            outbound += bucket.outbound;
            responseIn += bucket.responseIn;
            pushIn += bucket.pushIn;
            if (bucket.outbound > peakRps) {
                peakRps = bucket.outbound;
                peakSec = sec;
            }
            for (const [k, v] of bucket.byClass)
                mergeCount(byClass, k, v);
            for (const [k, v] of bucket.byMethod)
                mergeCount(byMethod, k, v);
        }
        const seconds = winSec;
        return {
            windowMs: seconds * TRAFFIC_BUCKET_MS,
            outbound,
            responseIn,
            pushIn,
            avgRps: Math.round((outbound / seconds) * 100) / 100,
            peakRps,
            peakSec,
            coveredSec,
            byClass: [...byClass.entries()].sort((a, b) => b[1] - a[1]),
            topMethods: [...byMethod.entries()].sort((a, b) => b[1] - a[1]).slice(0, TRAFFIC_TOP_METHODS),
        };
    }
    /** 压成一行，塞进已有的告警日志里，让每条掉线日志自带取证数据。 */
    function formatWindow(windowMs, now = Date.now()) {
        const s = snapshot(windowMs, now);
        const classes = s.byClass.map(([k, v]) => `${k}:${v}`).join(',');
        const methods = s.topMethods.map(([k, v]) => `${k}x${v}`).join(',');
        return `rps=${s.avgRps} peak=${s.peakRps}/s out=${s.outbound} in(回包=${s.responseIn},推送=${s.pushIn})`
            + `${classes ? ` 班次[${classes}]` : ''}`
            + `${methods ? ` 方法[${methods}]` : ''}`;
    }
    return { recordOutbound, recordInbound, reset, snapshot, formatWindow };
}
module.exports = {
    TRAFFIC_BUCKET_MS,
    TRAFFIC_RETENTION_MS,
    TRAFFIC_STATS_LOG_INTERVAL_MS,
    createTrafficMeter,
};
//# sourceMappingURL=traffic-meter.js.map