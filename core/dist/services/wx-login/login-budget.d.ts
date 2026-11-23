export {};
export interface LoginBudgetResult {
    /** false 表示这个窗口内额度已用尽，调用方应直接返回原有错误，不要再去打上游。 */
    allowed: boolean;
    /** 窗口内已用次数（含本次，allowed=false 时为已用满的次数）。 */
    used: number;
    /** 距离最早一次调用滑出窗口还有多久；额度未满时为 0。 */
    retryAfterMs: number;
}
//# sourceMappingURL=login-budget.d.ts.map