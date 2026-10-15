"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const share_reward_instances_json_1 = __importDefault(require("../activity-data/share-reward-instances.json"));
// 六个开关、六个动作，每一个都落在上游 milk-tea.ts / share-reward-activity.ts 里已经用
// 官方 1.15.0.1 编码向量验证过的 operate_type（收银台收益 59 / 工资 64 / 成长基金 76 /
// 今日快乐值 74 / 首次分享 70 / 档位奖励 71）。
// 只自动做「服务端说可以领、领了不会花东西、也不会选错对象」的事：开业要店名、制作要选果实、
// 雇佣要挑人、爆单和兑换要定量、升级会花金币，这些一律不建开关——挂着什么都不执行的自动化
// 开关比没有开关更坏，让它们空转等于骗用户。
const MILK_TEA_AUTOMATION_KEYS = [
    'milk_tea_claim_rewards',
    'milk_tea_claim_wages',
    'milk_tea_claim_fund',
    'milk_tea_happy_daily',
    'milk_tea_happy_share',
    'milk_tea_happy_milestones',
];
const MILK_TEA_CHECK_INTERVAL_MS = 30 * 60 * 1000;
function isMilkTeaAutomationEnabled(automation = {}) {
    return MILK_TEA_AUTOMATION_KEYS.some(key => automation[key] === true);
}
function createMilkTeaAutomation(deps) {
    const { getMilkTeaActivity, operateMilkTeaActivity, getShareRewardActivity, operateShareRewardActivity, getServerTimeSec, log } = deps;
    // 跳过原因按服务端日期去重：半小时一轮若每轮都为「今天已经领过」记一行，日志会被刷满。
    const skipLoggedOn = new Map();
    function todayKey() {
        return new Date((getServerTimeSec() + 8 * 3600) * 1000).toISOString().slice(0, 10);
    }
    function skip(action, text) {
        const key = `${todayKey()}:${action}`;
        if (skipLoggedOn.get(action) === key)
            return;
        skipLoggedOn.set(action, key);
        log('活动', `奶茶自动跳过 ${action}: ${text}`, { module: 'activity', event: '奶茶活动自动', result: 'skip', action });
    }
    function rewardText(result) {
        const rewards = result?.rewards || [];
        return rewards.length ? `，获得 ${rewards.map((item) => `${item.name}x${item.count}`).join('、')}` : '';
    }
    async function perform(title, run, action) {
        try {
            const result = await run();
            log('活动', `${title}完成${rewardText(result)}`, {
                module: 'activity', event: '奶茶活动自动', result: 'success', action,
            });
            return result;
        }
        catch (e) {
            // 单项失败不牵连同一轮里的其它领取：少领一次下一轮还能补，整轮中断才会把本来能成的也带走。
            // 回包不完整时 operate* 自己保证不重发，这里也绝不自己重试。
            log('活动', `${title}失败: ${e.message}`, {
                module: 'activity', event: '奶茶活动自动', result: 'error', action,
            });
            return null;
        }
    }
    /** 店铺侧动作的共同前置：活动开着，除基金外还要已经开业。返回可读状态，否则给出跳过原因。 */
    async function shopState(page, action, requireOpen = true) {
        const state = await getMilkTeaActivity(page);
        if (!state?.active) {
            skip(action, '活动不在开放时间');
            return null;
        }
        if (requireOpen && !Number(state.summary?.shop_open_at || 0)) {
            skip(action, '店铺还没开业，先在活动页点开业');
            return null;
        }
        return state;
    }
    async function runRewards() {
        const state = await shopState('shop', 'claim');
        if (!state)
            return;
        if (!state.shop?.pending_rewards?.some((v) => Number(v.count) > 0)) {
            skip('claim', '收银台暂无可领取收益');
            return;
        }
        await perform('领取奶茶收银台收益', () => operateMilkTeaActivity('claim'), 'claim');
    }
    async function runWages() {
        const state = await shopState('work', 'wages');
        if (!state)
            return;
        if (!state.work?.slips?.some((v) => Number(v.wage_status) === 1)) {
            skip('wages', '没有待领取的工资');
            return;
        }
        await perform('领取奶茶员工工资', () => operateMilkTeaActivity('wages'), 'wages');
    }
    async function runFund() {
        // 成长基金跟店铺开没开业无关，读的是 fund 页自己的进度。
        const state = await shopState('fund', 'fund_claim', false);
        if (!state)
            return;
        if (!state.fund?.unlocked) {
            skip('fund_claim', '成长基金还没解锁，解锁要在活动页确认付费');
            return;
        }
        if (!state.fund?.tiers?.some((v) => Number(v.state) === 2)) {
            skip('fund_claim', '没有已达档位可领取的成长基金奖励');
            return;
        }
        await perform('领取成长基金档位奖励', () => operateMilkTeaActivity('fundClaim'), 'fund_claim');
    }
    /**
     * 快乐不独享是活动组里的独立实例，每期换一个 activity_id，所以按实例表从新到旧找
     * 当前开着的那一期，而不是把 2026110104 写死在代码里。
     */
    async function activeShareReward() {
        const ids = [...share_reward_instances_json_1.default].map(v => v.activityId).sort().reverse();
        for (const activityId of ids) {
            const state = await getShareRewardActivity(activityId);
            if (state?.active)
                return { activityId, state };
        }
        return null;
    }
    async function runShareReward(flags) {
        let found = null;
        try {
            found = await activeShareReward();
        }
        catch (e) {
            log('活动', `快乐不独享读取状态失败: ${e.message}`, { module: 'activity', event: '奶茶活动自动', result: 'error', action: 'share_reward' });
            return;
        }
        if (!found) {
            skip('share_reward', '本期快乐不独享不在开放时间');
            return;
        }
        const { activityId, state } = found;
        const claim = (action, title) => perform(title, () => operateShareRewardActivity(activityId, action), action);
        if (flags.daily) {
            if (state.canClaimDaily)
                await claim('daily', '领取本期每日快乐值');
            else
                skip('daily', '今日快乐值已领取');
        }
        if (flags.share) {
            if (state.canShare)
                await claim('share', '领取本期首次分享奖励');
            else
                skip('share', '今日分享奖励已领取');
        }
        if (flags.milestones) {
            if (state.canClaimMilestones)
                await claim('milestones', '领取本期档位奖励');
            else
                skip('milestones', '没有可达标的档位');
        }
    }
    // 店铺侧三个领取和分享奖励彼此独立，任何一侧读失败都不该拖住另一边。
    async function runMilkTeaAutomation(flags) {
        const tasks = [];
        const guarded = (action, run) => run().catch((e) => {
            log('活动', `奶茶自动任务读取状态失败: ${e.message}`, { module: 'activity', event: '奶茶活动自动', result: 'error', action });
        });
        if (flags.claimRewards)
            tasks.push(guarded('claim', runRewards));
        if (flags.claimWages)
            tasks.push(guarded('wages', runWages));
        if (flags.claimFund)
            tasks.push(guarded('fund_claim', runFund));
        if (flags.happyDaily || flags.happyShare || flags.happyMilestones) {
            tasks.push(guarded('share_reward', () => runShareReward({
                daily: flags.happyDaily,
                share: flags.happyShare,
                milestones: flags.happyMilestones,
            })));
        }
        await Promise.all(tasks);
    }
    return { runMilkTeaAutomation };
}
module.exports = {
    createMilkTeaAutomation,
    isMilkTeaAutomationEnabled,
    MILK_TEA_AUTOMATION_KEYS,
    MILK_TEA_CHECK_INTERVAL_MS,
};
//# sourceMappingURL=milk-tea-auto.js.map