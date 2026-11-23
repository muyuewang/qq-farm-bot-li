/**
 * 取一次游戏登录 Code。
 *
 * 两条路径：
 *   1. 会话缓存命中（20 分钟内换过）→ 直接用缓存的 PSK/ticket 走短链 early data，
 *      跳过整个长链握手与 ManualAuth。这条路径不消耗登录预算，也不会在授权层
 *      留下新的登录记录 —— 这正是 YYB-Go-Enhanced 反复强调的关键。
 *   2. 未命中 → 完整握手。这一步要新建 ticket + ManualAuth，按账号走登录预算
 *      （10 分钟 3 次），避免业务流量把 OAuth 层打爆。
 */
export declare function getNativeWxLoginCode(loginBuffer: string, appId: string, options?: {
    accountId?: string;
}): Promise<string>;
/**
 * 仅导出给单测：解析 wx.login 的 JSLoginResponse。
 * 这是纯函数，不含网络与状态，单独测能覆盖 -14 这类「业务拒绝优先于 code」的分支。
 */
export declare function parseLoginCodeResponse(plain: Buffer): string | null;
//# sourceMappingURL=native-protocol.d.ts.map