export {};

// 两个开关都落在上游 muge-activity.ts 里已按官方编码器核对过的写操作：全服庆祝档位、
// 好友助力档位、成长手册任务、手册积分档位四类领取，以及人格测试收尾。
// 四类领取都不花任何东西，只在服务端自己说 status===2（可领取）时才发写请求，
// 且每类一次写就领完该类全部可领项（上游用 tier_id/task_id = 0 表达「全领」）。
// 人格测试不替用户选答案：10 题全部作答是服务端结算的前置条件，只有用户已经在游戏里
// 答完、却没按结算时才结算，随后领一次性的首次分享奖励；没答完只记一行跳过。
// 牧歌是农场场景（game_scene_id 1）的活动，与节令同侧，全程不切场景——挂进牧场巡查
// 反而要在 inScene() 的场景 2 上下文里发场景 1 的写请求，那条路没有抓包背书。
// 整个任务串进 automation-lock 的同一把全局锁，不会和农场/牧场/节令挤在一起发请求。
const MUGE_AUTOMATION_KEYS = [
    'muge_claim_rewards',
    'muge_finish_survey',
] as const;

const MUGE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
// 错相位：节令 19min、神秘商人 37min，牧歌挑 11min，三个周期任务不同秒到期。
const MUGE_CHECK_PHASE_MS = 11 * 60 * 1000;
// 首跑 210s：节令是 150s，登录后第一波活动读取不叠在同一秒。
const MUGE_INITIAL_DELAY_MS = 210000;
// 相邻两笔写入之间隔这么久：连着发会把活动页的读和写挤在同一根连接上。
const MUGE_STEP_SPACER_MS = 800;
// 服务端档位/任务状态：2＝可领取，3＝已领取，4＝未解锁。
const CLAIMABLE = 2;

function isMugeAutomationEnabled(automation: any = {}): boolean {
    return MUGE_AUTOMATION_KEYS.some(key => automation[key] === true);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createMugeAutomation(deps: {
    getMugeActivity: () => Promise<any>;
    operateMugeActivity: (action: string, input?: any) => Promise<any>;
    getServerTimeSec: () => number;
    log: (module: string, message: string, meta?: any) => void;
}) {
    const { getMugeActivity, operateMugeActivity, getServerTimeSec, log } = deps;
    // 跳过原因按服务端日期去重：半小时一轮若每轮都为「没什么可领」记一行，日志会被刷满。
    const skipLoggedOn = new Map<string, string>();

    function todayKey(): string {
        return new Date((getServerTimeSec() + 8 * 3600) * 1000).toISOString().slice(0, 10);
    }

    function skip(action: string, text: string): void {
        const key = `${todayKey()}:${action}`;
        if (skipLoggedOn.get(action) === key) return;
        skipLoggedOn.set(action, key);
        log('活动', `牧歌自动跳过 ${action}: ${text}`, { module: 'activity', event: '牧歌初启自动', result: 'skip', action });
    }

    function rewardText(result: any): string {
        const rewards = result?.rewards || [];
        return rewards.length ? `，获得 ${rewards.map((item: any) => `${item.name}x${item.count}`).join('、')}` : '';
    }

    async function perform(title: string, action: string): Promise<any> {
        try {
            const result = await operateMugeActivity(action);
            log('活动', `${title}完成${rewardText(result)}`, { module: 'activity', event: '牧歌初启自动', result: 'success', action });
            return result;
        }
        catch (e: any) {
            // 回包不完整时 operateMugeActivity 已抛 MUGE_RESULT_UNKNOWN 保证不重发，这里也绝不自己重试。
            log('活动', `${title}失败: ${e.message}`, { module: 'activity', event: '牧歌初启自动', result: 'error', action });
            return null;
        }
    }

    function stale(action: string): null {
        // 写成功了但状态刷新失败：本轮不再基于旧快照继续判断，剩下的下一轮重新读。
        log('活动', '牧歌初启刷新失败，本轮剩余操作留到下一轮', { module: 'activity', event: '牧歌初启自动', result: 'skip', action });
        return null;
    }

    /**
     * 一类领取的共同走法：服务端说这类里有可领项才发一次写，写完用回包里的最新快照
     * 接着判断下一类——写之后的状态只有服务端知道，拿旧快照继续领会把已领过的再领一次。
     * 返回 null 表示本轮到此为止（写未确认或刷新失败），返回原快照表示这类没什么可领。
     */
    async function claim(
        state: any,
        action: string,
        title: string,
        ready: (state: any) => boolean,
        absent: string,
    ): Promise<any> {
        if (!ready(state)) {
            skip(action, absent);
            return state;
        }
        const result = await perform(title, action);
        if (!result) return null;
        return result.activity || stale(action);
    }

    /** 人格测试收尾：只在用户已答完全部题时结算，再领一次性首次分享奖励。 */
    async function finishSurvey(state: any): Promise<any> {
        const action = 'finish_survey';
        const personality = state?.personality;
        if (!personality) {
            skip(action, '服务端这轮没给出牧场人格数据');
            return state;
        }
        const questions = state?.questions || [];
        const answers = personality.answers || {};
        // 与上游 settle 的前置校验同口径：每题都有一个落在官方选项里的答案才算答完。
        const answered = questions.length > 0
            && questions.every((q: any) => (q.options || []).some((o: any) => o.value === answers[String(q.id)]));
        if (!answered) {
            skip(action, '人格测试还没答完全部题目，答案属于你的偏好，留给你在牧歌页面自己选');
            return state;
        }

        let current = state;
        if (!personality.personalityId) {
            const result = await perform('牧场人格结算', 'settle');
            if (!result) return null;
            if (!result.activity) return stale(action);
            current = result.activity;
        }
        const settled = current?.personality;
        if (!settled?.personalityId) {
            skip(action, '结算后仍未拿到人格结果，首次分享留到下一轮');
            return current;
        }
        if (settled.shareRewardClaimed) {
            skip(action, '首次分享奖励已经领过');
            return current;
        }
        await sleep(MUGE_STEP_SPACER_MS);
        const result = await perform('领牧歌人格首次分享奖励', 'claimShare');
        if (!result) return null;
        return result.activity || stale(action);
    }

    async function runMugeAutomation(flags: { claimRewards: boolean; finishSurvey: boolean }): Promise<void> {
        let state: any;
        try {
            // 一轮只读一次：上游每次 operate 内部还会各读一次（写前校验 + 写后刷新），
            // 所以这里不再按步骤重复读，后续判断一律用写回包带回来的快照。
            state = await getMugeActivity();
        }
        catch (e: any) {
            if (e?.code === 'MUGE_UNAVAILABLE') {
                skip('read', '服务端这轮没下发牧歌初启活动组');
                return;
            }
            log('活动', `牧歌初启自动任务读取状态失败: ${e.message}`, { module: 'activity', event: '牧歌初启自动', result: 'error', action: 'read' });
            return;
        }
        if (!state?.active) {
            skip('read', '不在开放窗口（尚未开始或已经结束）');
            return;
        }

        let wrote = false;
        const spacing = async (): Promise<void> => { if (wrote) await sleep(MUGE_STEP_SPACER_MS); };

        if (flags.claimRewards) {
            const steps = [
                {
                    action: 'claimCelebration',
                    title: '领牧歌全服庆祝档位',
                    ready: (s: any) => (s?.celebration?.tiers || []).some((t: any) => t.status === CLAIMABLE),
                    absent: '当前没有可领取的全服庆祝档位',
                },
                {
                    action: 'claimFriends',
                    title: '领牧歌好友助力档位',
                    ready: (s: any) => (s?.friends?.tiers || []).some((t: any) => t.status === CLAIMABLE),
                    absent: '当前没有可领取的好友助力档位',
                },
                {
                    action: 'claimTask',
                    title: '领牧歌成长手册任务奖励',
                    ready: (s: any) => (s?.handbook?.tasks || []).some((t: any) => t.status === CLAIMABLE),
                    absent: '当前没有可领取的成长手册任务奖励',
                },
                {
                    // 排在手册任务之后：任务奖励带积分，先领任务同一轮就可能点亮积分档位。
                    action: 'claimHandbook',
                    title: '领牧歌成长手册积分档位',
                    ready: (s: any) => (s?.handbook?.tiers || []).some((t: any) => t.status === CLAIMABLE),
                    absent: '当前没有达标的手册积分档位',
                },
            ];
            for (const step of steps) {
                await spacing();
                const before = state;
                state = await claim(state, step.action, step.title, step.ready, step.absent);
                if (!state) return;
                if (state !== before) wrote = true;
            }
        }

        if (flags.finishSurvey) {
            await spacing();
            const before = state;
            state = await finishSurvey(state);
            if (!state) return;
            if (state !== before) wrote = true;
        }
    }

    return { runMugeAutomation };
}

let mugeAutomation: any = null;

async function runMugeTick(isReady: () => boolean): Promise<void> {
    if (!isReady()) return;
    const { getAutomation } = require('../models/store');
    const { runExclusiveAutomationTask } = require('./automation-lock');
    const automation = getAutomation() || {};
    if (!isMugeAutomationEnabled(automation)) return;
    await runExclusiveAutomationTask('muge', async () => {
        if (!isReady()) return;
        if (!mugeAutomation) {
            const { getMugeActivity, operateMugeActivity } = require('./muge-activity');
            const { getServerTimeSec, log } = require('../utils/utils');
            mugeAutomation = createMugeAutomation({ getMugeActivity, operateMugeActivity, getServerTimeSec, log });
        }
        await mugeAutomation.runMugeAutomation({
            claimRewards: automation.muge_claim_rewards === true,
            finishSurvey: automation.muge_finish_survey === true,
        });
    });
}

/** 定时器挂在调用方（worker）的 scheduler 上，停表时随 clearAll() 一起清掉。 */
function startMugeTimer(scheduler: any, isReady: () => boolean): void {
    scheduler.clear('muge_initial');
    scheduler.clear('muge_interval');
    if (!isReady()) return;
    const { getAutomation } = require('../models/store');
    if (!isMugeAutomationEnabled(getAutomation())) return;
    scheduler.setTimeoutTask('muge_initial', MUGE_INITIAL_DELAY_MS, () => {
        runMugeTick(isReady).catch(() => null);
    });
    scheduler.setIntervalTask('muge_interval', MUGE_CHECK_INTERVAL_MS, () => {
        runMugeTick(isReady).catch(() => null);
    }, { phaseMs: MUGE_CHECK_PHASE_MS });
}

module.exports = {
    createMugeAutomation,
    isMugeAutomationEnabled,
    startMugeTimer,
    MUGE_AUTOMATION_KEYS,
    MUGE_CHECK_INTERVAL_MS,
    MUGE_CHECK_PHASE_MS,
    MUGE_INITIAL_DELAY_MS,
    MUGE_STEP_SPACER_MS,
};