export {};
export interface PreflightAccountStats {
    /** 最近一次自动续期成功时间（毫秒时间戳，0 = 从未成功）。 */
    lastSuccessAt: number;
    /** 最近一次自动续期失败时间（毫秒时间戳，0 = 从未失败）。 */
    lastFailureAt: number;
    /** 当日（UTC+8 自然日）自动续期成功次数。 */
    successesToday: number;
    /** 当日（UTC+8 自然日）自动续期失败次数。成功不占额度。 */
    failuresToday: number;
}
export interface PreflightStatsFile {
    /** 当日计数所属的自然日（UTC+8，YYYY-MM-DD）。 */
    date: string;
    accounts: Record<string, PreflightAccountStats>;
}
/** 对外投影用的形状，多带一个 date 便于前端提示「今日」按北京时间算。 */
export interface PublicPreflightStats extends PreflightAccountStats {
    date: string;
}
//# sourceMappingURL=preflight-stats.d.ts.map