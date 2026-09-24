export {};

// 六个开关位、五个动作：每一项都对应上游 autumn-activities.ts 里已经用官方抓包
// 验证过的 operate_type（抽签 51 / 领奖 52 / 每日快乐值 73 / 档位 70 / 分享 69）。
// 日志查询（op 71）不改状态，没有为它建开关——挂着什么都不执行的自动化开关比没有开关更坏。
const AUTUMN_AUTOMATION_KEYS = [
    'autumn_wish_draw',
    'autumn_wish_claim',
    'autumn_happy_daily',
    'autumn_happy_share',
    'autumn_happy_milestones',
] as const;

const AUTUMN_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function isAutumnAutomationEnabled(automation: any = {}): boolean {
    return AUTUMN_AUTOMATION_KEYS.some(key => automation[key] === true);
}

function createAutumnAutomation(deps: {
    getAutumnActivity: (key: string) => Promise<any>;
    operateAutumnActivity: (key: string, action: string, input?: any) => Promise<any>;
    getServerTimeSec: () => number;
    log: (module: string, message: string, meta?: any) => void;
}) {
    const { getAutumnActivity, operateAutumnActivity, getServerTimeSec, log } = deps;
    // 跳过原因按服务端日期去重：这个定时器半小时一轮，每轮都为"今天已经领过"记一行会把日志刷满。
    const skipLoggedOn = new Map<string, string>();
    // 抽签是唯一不能只靠服务端状态挡重复的：remaining_count 是否等于"今日剩余次数"没有证据，
    // 万一它是整个活动的余额，半小时一轮就能把 14 天的份一次抽完。所以本地再按天记一次，
    // 且发出前先记，回包丢失也不补发——少抽一次可以等明天，多抽一次退不回来。
    const drawnOn = new Map<string, string>();

    function todayKey(): string {
        return new Date((getServerTimeSec() + 8 * 3600) * 1000).toISOString().slice(0, 10);
    }

    function skip(action: string, text: string): void {
        const key = `${todayKey()}:${action}`;
        if (skipLoggedOn.get(action) === key) return;
        skipLoggedOn.set(action, key);
        log('活动', `秋日活动自动跳过 ${action}: ${text}`, { module: 'activity', event: '秋日活动自动', result: 'skip', action });
    }

    function rewardText(result: any): string {
        const rewards = result?.rewards || [];
        return rewards.length ? `，获得 ${rewards.map((item: any) => `${item.name}x${item.count}`).join('、')}` : '';
    }

    async function perform(key: string, action: string, title: string, input?: any): Promise<any> {
        try {
            const result = await operateAutumnActivity(key, action, input);
            log('活动', `${title}完成${rewardText(result)}`, {
                module: 'activity', event: '秋日活动自动', result: 'success', action, key,
            });
            // operateAutumnActivity 的回包里带着操作后重读的状态，直接复用，省一次 GetGroup。
            return { state: result?.activity || null };
        }
        catch (e: any) {
            // 单项失败不牵连同一活动里的其它动作：三个领取彼此独立，少领一个明天还能补，
            // 整轮中断才会把后面本来能成的也带走。回包丢失（AUTUMN_RESPONSE_INVALID）由
            // operateAutumnActivity 自己保证不重发，这里也绝不自己重试。
            log('活动', `${title}失败: ${e.message}`, {
                module: 'activity', event: '秋日活动自动', result: 'error', action, key,
            });
            return null;
        }
    }

    async function runWish(flags: { draw: boolean; claim: boolean; choice: number }): Promise<void> {
        let state = await getAutumnActivity('wish');
        if (!state?.active) {
            skip('wish', '活动不在开放时间');
            return;
        }
        if (flags.claim) {
            if (!state.canClaim) { skip('wish_claim', '当前没有待领取的签文'); }
            else {
                const settled = await perform('wish', 'claim', '秋祈良愿领取祈愿奖励');
                if (!settled) return;
                // 领奖回包没带状态时再问一次服务端，别拿旧状态判断能不能抽。
                state = settled.state || await getAutumnActivity('wish');
            }
        }
        if (!flags.draw) return;
        const today = todayKey();
        if (drawnOn.get('wish') === today) return;
        if (!state.canDraw) {
            skip('wish_draw', `今日没有可抽的祈愿（剩余 ${state.remaining} 次，待领取 ${state.pending ? '有' : '无'}）`);
            return;
        }
        const choice = Number(flags.choice);
        const picked = (state.choices || []).find((item: any) => item.id === choice);
        if (!picked) {
            skip('wish_draw', `配置的祈愿方向 ${choice} 不在活动给出的选项里`);
            return;
        }
        drawnOn.set('wish', today);
        await perform('wish', 'draw', `秋祈良愿朝「${picked.name}」祈愿`, { chooseId: choice });
    }

    async function runHappy(flags: { daily: boolean; share: boolean; milestones: boolean }): Promise<void> {
        const state = await getAutumnActivity('happy');
        if (!state?.active) {
            skip('happy', '活动不在开放时间');
            return;
        }
        if (flags.daily) {
            if (state.canClaimDaily) await perform('happy', 'daily', '快乐不独享领取每日快乐值');
            else skip('happy_daily', '今日快乐值已领取');
        }
        if (flags.share) {
            if (state.canShare) await perform('happy', 'share', '快乐不独享领取首次分享奖励');
            else skip('happy_share', '今日分享奖励已领取');
        }
        if (flags.milestones) {
            if (state.canClaimMilestones) await perform('happy', 'milestones', '快乐不独享领取档位奖励');
            else skip('happy_milestones', '没有可达标的档位');
        }
    }

    // 两个活动彼此独立：一个读失败不能拖累另一个领东西。
    async function runAutumnAutomation(flags: {
        wishDraw: boolean;
        wishClaim: boolean;
        wishChoice: number;
        happyDaily: boolean;
        happyShare: boolean;
        happyMilestones: boolean;
    }): Promise<void> {
        const tasks: Array<Promise<void>> = [];
        if (flags.wishDraw || flags.wishClaim) {
            tasks.push(runWish({ draw: flags.wishDraw, claim: flags.wishClaim, choice: flags.wishChoice })
                .catch((e: any) => { log('活动', `秋祈良愿自动任务读取状态失败: ${e.message}`, { module: 'activity', event: '秋日活动自动', result: 'error', key: 'wish' }); }));
        }
        if (flags.happyDaily || flags.happyShare || flags.happyMilestones) {
            tasks.push(runHappy({ daily: flags.happyDaily, share: flags.happyShare, milestones: flags.happyMilestones })
                .catch((e: any) => { log('活动', `快乐不独享自动任务读取状态失败: ${e.message}`, { module: 'activity', event: '秋日活动自动', result: 'error', key: 'happy' }); }));
        }
        await Promise.all(tasks);
    }

    return { runAutumnAutomation };
}

module.exports = {
    createAutumnAutomation,
    isAutumnAutomationEnabled,
    AUTUMN_AUTOMATION_KEYS,
    AUTUMN_CHECK_INTERVAL_MS,
};
