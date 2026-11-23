export {};
/**
 * 账号 Code 自动监听（账号管理页）。
 *
 * 游戏登录 Code 是一次性的：微信侧有 expires_at / refreshtoken / loginBuffer，
 * 可以在到期前主动换 Code；QQ 侧没有到期时间，只能靠掉线日志判断 Code 是否
 * 已经失效。这里把两类信号聚合成前端可直接消费的状态，并给出「能否自动补 Code」
 * 的判定，避免账号管理页每 10 秒轮询时重复弹提示或反复打续期接口。
 */
export type CodeHealthLevel = 'ok' | 'unknown' | 'expiring' | 'expired' | 'refresh_failed' | 'offline';
export interface CodeHealthItem {
    accountId: string;
    name: string;
    platform: string;
    level: CodeHealthLevel;
    reason: string;
    autoFixable: boolean;
    needsManual: boolean;
    remainingMs: number;
    latestLogAction: string;
}
export interface AutoFixResult {
    ok: boolean;
    accountId: string;
    platform: string;
    needsManual: boolean;
    restarted: boolean;
    error: string;
}
interface InspectOptions {
    now?: number;
    /** undefined 表示调用方拿不到运行状态，此时不按掉线日志判定。 */
    running?: boolean;
    latestLogAction?: string;
}
interface SnapshotDeps {
    now?: number;
    accountLogs?: any[];
    isAccountRunning?: (accountId: string) => boolean;
}
interface AutoFixDeps {
    getAccount: (accountId: string) => any;
    latestLogAction?: string;
    ensureFreshGameCode: (accountId: string) => Promise<any>;
    tryRefreshQqGameCode: (accountId: string) => Promise<any>;
    isAccountRunning: (accountId: string) => boolean;
    restartAccount: (accountId: string) => void;
    addAccountLog: (action: string, msg: string, accountId: string, accountName: string, extra?: any) => void;
    notify?: (accountId: string, entry: any) => any;
}
export declare function inspectAccountCodeHealth(account: any, options?: InspectOptions): CodeHealthItem;
/**
 * 账号日志按「最新在前」传入；只取每个账号最后一条日志的动作，
 * 这样用户手动停止（stop）之后不会再被历史掉线日志误判成需要补 Code。
 */
export declare function buildCodeHealthSnapshot(accounts: any[], deps?: SnapshotDeps): {
    items: CodeHealthItem[];
    needsAttention: number;
    generatedAt: number;
};
/**
 * 自动补 Code：微信走免扫码换码（loginBuffer 优先，不消耗滚动 token），
 * QQ 走尽力重签。成功后运行中账号立刻用新 Code 重连，因掉线停下的账号自动拉起。
 * 失败统一返回 needsManual，由面板引导重新扫码 / 手动填 Code。
 */
export declare function autoFixAccountCode(accountId: unknown, deps: AutoFixDeps): Promise<AutoFixResult>;
//# sourceMappingURL=code-watch.d.ts.map