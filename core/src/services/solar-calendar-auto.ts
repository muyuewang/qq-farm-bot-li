export {};

// 两个开关都落在上游 solar-calendar.ts 里已按官方编码器核对过的写操作：
// 节令直达奖励 ClaimSolarTermsV2、季度奖励 ClaimSolarSeason。两者都不花任何东西，
// 只在服务端自己说 canClaim（在开放窗口里、还没领过）时才发写请求。
// 答题 AnswerSolarTerms 故意不建开关：官方活动配置里只有题目和选项文本，没有正确答案索引，
// 而答错会锁到第二天——没有可自动化的固定选法时，挂一个什么都不做的开关比不挂更坏
// （2026-10-16 用户确认只要自动领免费的）。
// 节奏和奶茶一致：默认全开、一轮串行、项间隔 800ms，整个活动自动化再串进
// automation-lock 的同一把锁，不会和神秘商人、奶茶挤在一起发请求。
const SOLAR_CALENDAR_AUTOMATION_KEYS = [
    'solar_calendar_claim_events',
    'solar_calendar_claim_seasons',
] as const;

const SOLAR_CALENDAR_CHECK_INTERVAL_MS = 30 * 60 * 1000;
// 两个领取步骤之间隔这么久：连着发会把活动页的读和写挤在同一根连接上。
const SOLAR_CALENDAR_TASK_SPACER_MS = 800;
// 同一步里连续两笔领取之间隔得短一些，但仍不占满连接。
const SOLAR_CALENDAR_CLAIM_SPACER_MS = 400;
// 一轮最多领 5 个节令、3 个季度：日历同时开放中的节令一般只有一两个，
// 夹住是为了万一官方把多个窗口叠在一起时，一轮也不会发一串写请求。
const EVENT_CLAIMS_PER_TICK = 5;
const SEASON_CLAIMS_PER_TICK = 3;

function isSolarCalendarAutomationEnabled(automation: any = {}): boolean {
    return SOLAR_CALENDAR_AUTOMATION_KEYS.some(key => automation[key] === true);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createSolarCalendarAutomation(deps: {
    getSolarCalendar: () => Promise<any>;
    operateSolarCalendar: (action: string, input?: any) => Promise<any>;
    getServerTimeSec: () => number;
    log: (module: string, message: string, meta?: any) => void;
}) {
    const { getSolarCalendar, operateSolarCalendar, getServerTimeSec, log } = deps;
    // 跳过原因按服务端日期去重：半小时一轮若每轮都为「没什么可领」记一行，日志会被刷满。
    const skipLoggedOn = new Map<string, string>();

    function todayKey(): string {
        return new Date((getServerTimeSec() + 8 * 3600) * 1000).toISOString().slice(0, 10);
    }

    function skip(action: string, text: string): void {
        const key = `${todayKey()}:${action}`;
        if (skipLoggedOn.get(action) === key) return;
        skipLoggedOn.set(action, key);
        log('活动', `节令自动跳过 ${action}: ${text}`, { module: 'activity', event: '节令日历自动', result: 'skip', action });
    }

    function rewardText(result: any): string {
        const rewards = result?.rewards || [];
        return rewards.length ? `，获得 ${rewards.map((item: any) => `${item.name}x${item.count}`).join('、')}` : '';
    }

    async function perform(title: string, run: () => Promise<any>, action: string): Promise<any> {
        try {
            const result = await run();
            log('活动', `${title}完成${rewardText(result)}`, { module: 'activity', event: '节令日历自动', result: 'success', action });
            return result;
        }
        catch (e: any) {
            // 单项失败不牵连同一轮里的其它领取；回包不完整时 operateSolarCalendar 已保证不重发，这里也绝不自己重试。
            log('活动', `${title}失败: ${e.message}`, { module: 'activity', event: '节令日历自动', result: 'error', action });
            return null;
        }
    }

    /**
     * 逐项领取的共同走法：先用一次读请求拿到可领清单，再按顺序领，
     * 每笔写入后用回包里的最新日历接着判断——写之后的状态只有服务端知道，
     * 拿旧清单继续领会把已经领过的再领一次。
     */
    async function claimEach(
        kind: 'claim' | 'season',
        action: string,
        title: (entry: any) => string,
        pick: (calendar: any) => any[],
        limit: number,
    ): Promise<void> {
        const calendar = await getSolarCalendar();
        const pending = pick(calendar).filter((v: any) => v.canClaim);
        if (!pending.length) {
            skip(action, kind === 'claim' ? '当前没有可领取直达奖励的节令' : '当前没有达标的季度奖励');
            return;
        }

        let state = calendar;
        for (const entry of pending.slice(0, limit)) {
            // 上一笔写入可能已经改掉这一项的状态（例如季度奖励随节令领取一起达标），以最新回包为准。
            const fresh = pick(state).find((v: any) => Number(v.id) === Number(entry.id));
            if (!fresh?.canClaim) continue;
            const result = await perform(
                `${title(fresh)}`,
                () => operateSolarCalendar(kind, { id: Number(entry.id) }),
                action,
            );
            if (!result) continue;
            if (result.calendar) state = result.calendar;
            else {
                // 领取成功但状态刷新失败：本轮不再基于旧数据继续判断，剩下的下一轮重新读。
                log('活动', '节令日历刷新失败，本轮剩余领取留到下一轮', { module: 'activity', event: '节令日历自动', result: 'skip', action });
                return;
            }
            await sleep(SOLAR_CALENDAR_CLAIM_SPACER_MS);
        }
    }

    async function runSolarCalendarAutomation(flags: { claimEvents: boolean; claimSeasons: boolean }): Promise<void> {
        const steps: { action: string; run: () => Promise<void> }[] = [];
        if (flags.claimEvents) {
            steps.push({
                action: 'claim_events',
                run: () => claimEach('claim', 'claim_events',
                    (v: any) => `领节令直达奖励（${v.name}）`,
                    (state: any) => state?.events || [],
                    EVENT_CLAIMS_PER_TICK),
            });
        }
        if (flags.claimSeasons) {
            steps.push({
                action: 'claim_seasons',
                run: () => claimEach('season', 'claim_seasons',
                    (v: any) => `领季度奖励（${v.name}）`,
                    (state: any) => state?.seasons || [],
                    SEASON_CLAIMS_PER_TICK),
            });
        }

        for (let index = 0; index < steps.length; index++) {
            if (index) await sleep(SOLAR_CALENDAR_TASK_SPACER_MS);
            try {
                await steps[index].run();
            }
            catch (e: any) {
                log('活动', `节令日历自动任务读取状态失败: ${e.message}`, { module: 'activity', event: '节令日历自动', result: 'error', action: steps[index].action });
            }
        }
    }

    return { runSolarCalendarAutomation };
}

module.exports = {
    createSolarCalendarAutomation,
    isSolarCalendarAutomationEnabled,
    SOLAR_CALENDAR_AUTOMATION_KEYS,
    SOLAR_CALENDAR_CHECK_INTERVAL_MS,
    SOLAR_CALENDAR_TASK_SPACER_MS,
};
