export {};

const HEARTBEAT_STALE_AFTER_MS = 30000;
// 判死前多给两次心跳的余地：miss=1/2 时网关退避已经压住了业务出站，多等的 50s 不会攒超时请求。
const MAX_HEARTBEAT_MISSES = 5;

function shouldTerminateForHeartbeat(missCount: number, inboundSilenceMs: number): boolean {
    return Number(missCount) >= MAX_HEARTBEAT_MISSES
        && Number(inboundSilenceMs) > HEARTBEAT_STALE_AFTER_MS;
}

module.exports = {
    HEARTBEAT_STALE_AFTER_MS,
    MAX_HEARTBEAT_MISSES,
    shouldTerminateForHeartbeat,
};
