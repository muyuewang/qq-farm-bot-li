export {};
/**
 * 微信登录链路的错误分类与恢复策略。
 *
 * 移植 YYB-Go-Enhanced 的 internal/protocol/code_recovery.go：
 * 微信在各个阶段拒绝请求时给的是同一个「数字」，但含义完全不同——
 * 有的是「这个 AppID 被拒」，有的是「ticket 过期」，有的是「token 被吊销」。
 * 早期实现一律当成「续期失败 → 重登」，于是出现两类反向伤害：
 *
 *   1. `-14`（应用层拒绝）时重新登录，把本来还能用的授权白白消耗一次；
 *   2. `-109`（refresh token 已被吊销）时继续按节奏重试，在授权层不断累加拒绝。
 *
 * 这里只做「分类 + 该等多久」这一件事，不碰网络、不碰存储，便于单测覆盖全表。
 */
export type ProtocolErrorKind = 
/** js-login 的业务拒绝（-14）：AppID 侧拒绝，不代表会话失效。 */
'application_rejected'
/** ManualAuth 的 ticket 被拒（-10）：允许重新取一次 ticket。 */
 | 'ticket_rejected'
/** access token 失效（-101 / 40014 / 42001）：还能靠 refresh token 救。 */
 | 'access_rejected'
/** refresh token 已被吊销（-109 / 42007 / 40030 / 42002）：救不回来。 */
 | 'refresh_rejected'
/** scope 不匹配（40188 + invalid scope）：授权范围本身失效。 */
 | 'scope_rejected'
/** 网络 / 超时 / 5xx / 无法识别的错误。 */
 | 'transient';
export interface ProtocolErrorInfo {
    kind: ProtocolErrorKind;
    /** 从报文里抽出来的业务码，抽不到为 null。 */
    code: number | null;
    message: string;
    /** 服务端已明确吊销凭证：必须停止自动重试，等用户重新扫码。 */
    definitive: boolean;
    needsRescan: boolean;
    retryable: boolean;
    /** 属于「业务层拒绝」（-14 / -10），可以重试用新 ticket，但不该直接滚 token。 */
    businessRejected: boolean;
}
//# sourceMappingURL=recovery-policy.d.ts.map