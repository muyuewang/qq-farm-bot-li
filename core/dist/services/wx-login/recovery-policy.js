"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** js-login 业务拒绝：AppID 自己的拒绝，不是会话失效。 */
const APPLICATION_REJECTED = -14;
/** ManualAuth 的 ticket 被拒。 */
const TICKET_REJECTED = -10;
const ACCESS_REJECTED_CODES = [-101, 40014, 42001];
const REFRESH_REJECTED_CODES = [-109, 42007, 40030, 42002];
const SCOPE_REJECTED_CODE = 40188;
/**
 * 「刚成功过就不要再登录」的窗口。
 *
 * -14 更像 AppID 自己的拒绝。两分钟内同一个会话刚拿到过 code，再花一次
 * ManualAuth + ticket 去换，只会让授权层多一次拒绝记录。这是启发式判断，
 * 不是服务端有效性的证明，所以窗口设得短（2 分钟）。
 */
const FRESH_SESSION_WINDOW_MS = 2 * 60_000;
/** 同一个 (账号, AppID) 的补码重试间隔：一次 -14 修复失败后 5 分钟内不再试。 */
const CODE_REPAIR_BACKOFF_MS = 5 * 60_000;
/** 保活失败的默认退避上限。 */
const REFRESH_BACKOFF_MS = 5 * 60_000;
/** token 已经过期时的退避：续期窗口已经过去，每个 tick 重试只是重复被拒。 */
const EXPIRED_RETRY_BACKOFF_MS = 15 * 60_000;
/** 退避下限：官方续期窗口只有约 4 分钟，退避 5 分钟会整窗错过。 */
const MIN_BACKOFF_MS = 30_000;
function extractCode(message) {
    const matched = /(?:code|ret|retcode|errcode|errorcode)\s*[=:]\s*(-?\d+)/i.exec(message);
    if (matched) {
        const code = Number(matched[1]);
        if (Number.isFinite(code))
            return code;
    }
    const http = /HTTP\s+(\d{3})/i.exec(message);
    if (http) {
        const code = Number(http[1]);
        if (Number.isFinite(code))
            return code;
    }
    return null;
}
function kindOfCode(code) {
    if (code === null)
        return null;
    if (code === APPLICATION_REJECTED)
        return 'application_rejected';
    if (code === TICKET_REJECTED)
        return 'ticket_rejected';
    if (code === SCOPE_REJECTED_CODE)
        return 'scope_rejected';
    if (ACCESS_REJECTED_CODES.includes(code))
        return 'access_rejected';
    if (REFRESH_REJECTED_CODES.includes(code))
        return 'refresh_rejected';
    return null;
}
/**
 * 凭证被吊销的文案判定（对应 Go 的 definitiveRefreshMessage）。
 *
 * 只认「明确的吊销措辞」，普通传输错误的 body 里偶尔也会出现
 * 「token expired」，那不能当成微信吊销了会话。
 */
function looksRevoked(message) {
    const text = String(message || '').toLowerCase().replace(/[_-]/g, ' ');
    if (/invalid\s*scope/.test(text) && text.includes('40188'))
        return true;
    if (/relogin|re login|重新登录|重新授权|重新扫码/.test(text))
        return true;
    const invalid = /invalid|expired|revoked|无效|过期|失效/.test(text);
    // refresh token 的写法有空格、下划线（已归一成空格）和连写三种，一条正则全覆盖。
    const refreshToken = /refresh\s*token|刷新令牌/.test(text);
    return invalid && refreshToken;
}
function classifyProtocolError(error) {
    const message = String((error && error.message) || error || '');
    const code = extractCode(message);
    let kind = kindOfCode(code);
    if (!kind)
        kind = looksRevoked(message) ? 'refresh_rejected' : 'transient';
    const definitive = kind === 'refresh_rejected' || kind === 'scope_rejected';
    const businessRejected = kind === 'application_rejected' || kind === 'ticket_rejected';
    return {
        kind,
        code,
        message,
        definitive,
        needsRescan: definitive,
        retryable: !definitive,
        businessRejected,
    };
}
/** 是否属于「业务层拒绝」（-14 / -10）：可以重试，但不该直接滚 token。 */
function isBusinessResponseRejection(error) {
    return classifyProtocolError(error).businessRejected;
}
/** 是否是 -14：AppID 侧拒绝，最不该触发重新登录的那一类。 */
function isApplicationRequestRejection(error) {
    return classifyProtocolError(error).kind === 'application_rejected';
}
/**
 * -14 之后要不要真的去补一次会话。
 *
 * 同一个会话在 freshSessionWindow 内刚成功拿到过 code → 这次的 -14 更可能是
 * AppID 自己的拒绝，重新登录只会多消耗一次授权，直接放弃本次修复。
 */
function shouldRepairAfterApplicationRejection(error, lastSuccessAt, now = Date.now(), freshSessionWindow = FRESH_SESSION_WINDOW_MS) {
    if (!isApplicationRequestRejection(error))
        return false;
    if (freshSessionWindow <= 0)
        return true;
    const last = Number(lastSuccessAt) || 0;
    if (!last)
        return true;
    return now - last >= freshSessionWindow;
}
/**
 * 保活失败后等多久再试（对应 Go 的 keepAliveFailureBackoff）。
 *
 * - 已确定吊销 → 0，表示「不要再自动重试」，由调用方标记需要重新扫码；
 * - token 已过期 → 15 分钟，续期窗口已经过去；
 * - 其余 → min(5 分钟, max(30 秒, 剩余寿命 / 2))。
 */
function computeRefreshBackoff(remainingMs, info) {
    if (info && info.definitive)
        return 0;
    const remaining = Number(remainingMs);
    if (!Number.isFinite(remaining) || remaining <= 0)
        return EXPIRED_RETRY_BACKOFF_MS;
    return Math.min(REFRESH_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, Math.floor(remaining / 2)));
}
module.exports = {
    FRESH_SESSION_WINDOW_MS,
    CODE_REPAIR_BACKOFF_MS,
    REFRESH_BACKOFF_MS,
    EXPIRED_RETRY_BACKOFF_MS,
    MIN_BACKOFF_MS,
    classifyProtocolError,
    isBusinessResponseRejection,
    isApplicationRequestRejection,
    shouldRepairAfterApplicationRejection,
    computeRefreshBackoff,
    looksRevoked,
};
//# sourceMappingURL=recovery-policy.js.map