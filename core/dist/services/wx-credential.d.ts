export {};
export interface CredentialRefreshResult {
    ok: boolean;
    accountId: string;
    accountName: string;
    code?: string;
    /** 失败原因（可直接展示给用户）。 */
    error?: string;
    /** 失败但凭证已滚动时的最新授权到期时间。 */
    expiresAt?: number;
    /** 服务端已明确吊销凭证：只能重新扫码，自动重试不会成功。 */
    needsRescan?: boolean;
    /** 协议错误分类（application_rejected / refresh_rejected / transient ...）。 */
    kind?: string;
    /** 本次是否真的拿到了新 Code。仅滚 token 的续期为 false。 */
    codeIssued?: boolean;
}
//# sourceMappingURL=wx-credential.d.ts.map