export type ScanStatus = 'waiting' | 'scanned' | 'authorized' | 'cancelled' | 'expired';
/** 微信授权凭据：续期只需要 refreshtoken + openid，loginBuffer 用于换游戏登录 Code。 */
export interface WxCredential {
    openid: string;
    refreshtoken: string;
    accesstoken: string;
    loginBuffer: string;
    expires_in: number;
    expires_at: number;
    refreshedAt: number;
}
export interface WxLoginSession {
    cookies: Map<string, string>;
    uuid: string;
    oauthCode?: string;
    openid?: string;
    nickname?: string;
    loginBuffer?: string;
    refreshtoken?: string;
    accesstoken?: string;
    expires_in?: number;
    expires_at?: number;
}
export declare class WxLoginService {
    createQrSession(): Promise<{
        session: WxLoginSession;
        qr: Buffer;
    }>;
    poll(session: WxLoginSession): Promise<ScanStatus>;
    confirm(session: WxLoginSession): Promise<{
        openid: string;
        loginBuffer: string;
        refreshtoken: string;
        accesstoken: string;
        expires_in: number;
        expires_at: number;
    }>;
    /**
     * 只滚 OAuth token，不取 loginBuffer。
     *
     * 后台保活走这条：官方续期只需要把 access / refresh token 滚到下一轮，
     * loginBuffer 等真的要换 Code 时再按需取。YYB-Go-Enhanced 的注释写得很直白——
     * 官方 token 保活不获取新的 ILink login buffer，buffer 在协议调用真正需要时才恢复。
     * 每次保活都顺手取一次 buffer，等于每 2 小时多打一次
     * pcyyb_get_wx_login_buffer_auth，而决定授权存活的是 OAuth 层调用次数，不是业务请求数。
     */
    refreshOAuthToken(input: {
        openid?: string;
        refreshtoken?: string;
        accesstoken?: string;
    }): Promise<{
        openid: string;
        refreshtoken: string;
        accesstoken: string;
        expires_in: number;
        expires_at: number;
        refreshedAt: number;
    }>;
    /**
     * 用 refreshtoken 续期微信授权，换回新的 accessToken 与 loginBuffer。
     * refresh token 是滚动凭证：刷新成功后旧 token 立即失效，调用方无论换 Buffer 成败都必须持久化新 token。
     */
    refreshLoginBuffer(input: {
        openid?: string;
        refreshtoken?: string;
        accesstoken?: string;
    }): Promise<WxCredential>;
    issueCode(session: WxLoginSession, appId: string, accountId?: string): Promise<string>;
    destroy(session: WxLoginSession): void;
}
//# sourceMappingURL=service.d.ts.map