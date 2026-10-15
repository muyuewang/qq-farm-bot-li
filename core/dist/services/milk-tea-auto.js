"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const share_reward_instances_json_1 = __importDefault(require("../activity-data/share-reward-instances.json"));
// 十个开关，每一个都落在上游 milk-tea.ts / share-reward-activity.ts 里已经用
// 官方 1.15.0.1 编码向量验证过的 operate_type（收银台收益 59 / 工资 64 / 成长基金 76 /
// 今日快乐值 74 / 首次分享 70 / 档位奖励 71 / 制作 62 / 雇佣 57 / 升级 61 / 爆单 60）。
// 六个领取只做「服务端说可以领、领了不花东西」的事。制作、雇佣、升级、爆单会花果实、
// 奶茶券、店内金币和宣传喇叭，用户 2026-10-15 明确要求自动化并给定选法：
// 制作按背包顺序取有库存且未锁定的果实；雇佣在可雇的好友里随机一个；升级达标就升；
// 爆单按待售杯数决定喇叭用量。要人起名字、选商品、选互动类型的（开业/改名/兑换/
// 基金解锁/工作互动/躺平开关）仍然不建开关——挂着什么都不执行的自动化开关比没有开关更坏。
// 十个开关默认全开（用户 2026-10-15 要求：活动进行中就让它自己跑），一轮里十项串行执行、
// 项间隔 800ms，不做并发；runExclusiveAutomationTask 已经把整个活动自动化串在一条锁上。
const MILK_TEA_AUTOMATION_KEYS = [
    'milk_tea_claim_rewards',
    'milk_tea_claim_wages',
    'milk_tea_claim_fund',
    'milk_tea_happy_daily',
    'milk_tea_happy_share',
    'milk_tea_happy_milestones',
    'milk_tea_craft',
    'milk_tea_hire',
    'milk_tea_upgrade',
    'milk_tea_boost',
];
const MILK_TEA_CHECK_INTERVAL_MS = 30 * 60 * 1000;
// 一轮里十项排着队跑，项与项之间隔这么久：连着发会把活动页的读和写挤在同一根连接上。
const MILK_TEA_TASK_SPACER_MS = 800;
// 一轮最多 6 次制作请求、每次最多 20 堆果实：库存上千堆时不能把连接占满，剩下的下一轮接着做。
const CRAFT_CALLS_PER_TICK = 6;
const CRAFT_STACKS_PER_CALL = 20;
const CRAFT_SPACER_MS = 400;
// 雇佣时长按官方活动页的默认选择（最短一档），工资和雇佣位消耗都按它报价。
const HIRE_DURATION_ID = 1;
function isMilkTeaAutomationEnabled(automation = {}) {
    return MILK_TEA_AUTOMATION_KEYS.some(key => automation[key] === true);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    async function shopState(page, action, requireOpen = true, input = {}) {
        const state = await getMilkTeaActivity(page, input);
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
    /** 只在活动开放且不在结算期时执行会改变店铺状态的动作。 */
    function canOperate(state) {
        return !!state?.active && !state?.settling && !state?.shop?.is_settling;
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
     * 制作奶茶（62）。服务端要求每堆的数量和刚读到的一致，所以只能整堆提交；按果实 id 分组、
     * 组内保持背包顺序，一次请求里不混不同果实，每组每批最多 CRAFT_STACKS_PER_CALL 堆，
     * 一轮最多 CRAFT_CALLS_PER_TICK 批。选定后由 milk-tea.ts 重新读工坊页校验 uid/数量/锁定，
     * 中途变了会报「已变化」而不是做错。
     */
    async function runCraft() {
        const state = await shopState('workshop', 'craft');
        if (!state)
            return;
        if (!canOperate(state)) {
            skip('craft', '结算期不可制作奶茶');
            return;
        }
        const stacks = (state.fruits || []).filter((v) => !v.locked && Number(v.count) > 0);
        if (!stacks.length) {
            skip('craft', '背包里没有可制作的果实（未解锁配方、已锁定或没库存）');
            return;
        }
        const groups = [];
        for (const stack of stacks) {
            const id = Number(stack.id);
            const group = groups.find(v => v.id === id);
            if (group)
                group.stacks.push(stack);
            else
                groups.push({ id, name: stack.name || `果实 #${id}`, stacks: [stack] });
        }
        const batches = groups.flatMap((group) => Array.from({ length: Math.ceil(group.stacks.length / CRAFT_STACKS_PER_CALL) }, (_, index) => ({ name: group.name, stacks: group.stacks.slice(index * CRAFT_STACKS_PER_CALL, (index + 1) * CRAFT_STACKS_PER_CALL) })));
        for (const batch of batches.slice(0, CRAFT_CALLS_PER_TICK)) {
            const total = batch.stacks.reduce((sum, v) => sum + Number(v.count), 0);
            await perform(`制作奶茶（${batch.name} ×${total}）`, () => operateMilkTeaActivity('craft', { fruits: batch.stacks.map((v) => ({ uid: v.uid, count: v.count })) }), 'craft');
            await sleep(CRAFT_SPACER_MS);
        }
        if (batches.length > CRAFT_CALLS_PER_TICK) {
            log('活动', `奶茶制作本轮到上限 ${CRAFT_CALLS_PER_TICK} 次，剩余果实下一轮继续`, {
                module: 'activity', event: '奶茶活动自动', result: 'skip', action: 'craft',
            });
        }
    }
    /** 雇佣员工（57）：找第一个空位，在「可雇佣」的好友里随机一个；机器人候选不算好友，跳过。 */
    async function runHire() {
        const state = await shopState('hireList', 'hire', true, { durationId: HIRE_DURATION_ID });
        if (!state)
            return;
        if (!canOperate(state)) {
            skip('hire', '结算期不可雇佣');
            return;
        }
        const now = getServerTimeSec();
        const slots = Number(state.levels?.find((v) => Number(v.level) === Number(state.summary?.level))?.employee_slot_count || 0);
        const busy = new Set((state.shop?.slots || [])
            .filter((v) => Number(v.end_at || 0) > now)
            .map((v) => Number(v.slot_index)));
        const slotIndex = Array.from({ length: slots }, (_, index) => index).find(index => !busy.has(index));
        if (slotIndex === undefined) {
            skip('hire', '员工位置都已有人或尚未解锁');
            return;
        }
        if (Number(state.settleStartTime - now) < Number(state.hire?.min_remain_biz_sec || 0)) {
            skip('hire', '剩余营业时间不足以完成一个班次');
            return;
        }
        const eligible = (state.hire?.friends || []).filter((v) => Number(v.state || 0) === 0 && Number(v.rehire_available_at || 0) <= now && /^[1-9]\d*$/.test(String(v.friend?.gid || '')));
        if (!eligible.length) {
            skip('hire', '好友列表里没有当前可雇佣的员工');
            return;
        }
        const chosen = eligible[Math.floor(Math.random() * eligible.length)];
        const wage = Number(state.hire?.wage_total || 0);
        if (Number(state.balances?.['1041'] || 0) < wage) {
            skip('hire', `奶茶券不足，雇 ${chosen.friend.name || chosen.friend.gid} 需要 ${wage}`);
            return;
        }
        await perform(`雇佣奶茶员工（${chosen.friend.name || chosen.friend.gid}，位置 ${slotIndex + 1}）`, () => operateMilkTeaActivity('hire', {
            slotIndex,
            targetGid: String(chosen.friend.gid),
            durationId: HIRE_DURATION_ID,
            expectedCosts: [{ id: 1041, count: wage }],
        }), 'hire');
    }
    /** 店铺升级（61）：达标就升，会花店内金币；expectedLevel 用刚读到的等级，等级变了由服务端侧校验拒掉。 */
    async function runUpgrade() {
        const state = await shopState('upgrade', 'upgrade');
        if (!state)
            return;
        if (!state.summary?.can_upgrade) {
            skip('upgrade', '还没达到店铺升级的营业额条件');
            return;
        }
        await perform('奶茶店铺升级', () => operateMilkTeaActivity('upgrade', { expectedLevel: Number(state.summary.level) }), 'upgrade');
    }
    /**
     * 一键爆单（60）：一个宣传喇叭卖 boost_cups_per_use 杯，用量按待售杯数向上取整，
     * 再按持有量和官方单次上限 9999 夹住。没有待售杯就不花喇叭。
     */
    async function runBoost() {
        const state = await shopState('shop', 'boost');
        if (!state)
            return;
        if (!canOperate(state)) {
            skip('boost', '结算期不可爆单');
            return;
        }
        const shop = state.shop || {};
        const cups = Object.values(shop.pending_cups_by_recipe || {});
        const pending = cups.reduce((sum, v) => sum + Number(v || 0), 0);
        if (pending <= 0) {
            skip('boost', '没有待售奶茶，不必花宣传喇叭');
            return;
        }
        const itemId = Number(shop.sales_item_id || 0);
        const perUse = Number(shop.boost_cups_per_use || 0);
        const owned = Number(state.balances?.[String(itemId)] || 0);
        if (!itemId || !perUse || owned <= 0) {
            skip('boost', `没有可用的宣传喇叭（物品 ${itemId}），当前 ${owned}`);
            return;
        }
        const count = Math.min(9999, owned, Math.ceil(pending / perUse));
        if (count < 1) {
            skip('boost', '待售数量不足一次爆单');
            return;
        }
        await perform(`一键爆单 ${count} 次（待售 ${pending} 杯）`, () => operateMilkTeaActivity('boost', { count, expectedCosts: [{ id: itemId, count: 1 }] }), 'boost');
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
    // 十项按开关顺序一项一项跑，项间留 MILK_TEA_TASK_SPACER_MS：读页面和写请求都不叠，
    // 但任何一项读失败或写失败只记自己的日志，后面的照跑。
    async function runMilkTeaAutomation(flags) {
        const steps = [];
        if (flags.claimRewards)
            steps.push({ action: 'claim', run: runRewards });
        if (flags.claimWages)
            steps.push({ action: 'wages', run: runWages });
        if (flags.claimFund)
            steps.push({ action: 'fund_claim', run: runFund });
        if (flags.craft)
            steps.push({ action: 'craft', run: runCraft });
        if (flags.hire)
            steps.push({ action: 'hire', run: runHire });
        if (flags.upgrade)
            steps.push({ action: 'upgrade', run: runUpgrade });
        if (flags.boost)
            steps.push({ action: 'boost', run: runBoost });
        if (flags.happyDaily || flags.happyShare || flags.happyMilestones) {
            steps.push({
                action: 'share_reward',
                run: () => runShareReward({
                    daily: flags.happyDaily,
                    share: flags.happyShare,
                    milestones: flags.happyMilestones,
                }),
            });
        }
        for (let index = 0; index < steps.length; index++) {
            if (index)
                await sleep(MILK_TEA_TASK_SPACER_MS);
            try {
                await steps[index].run();
            }
            catch (e) {
                log('活动', `奶茶自动任务读取状态失败: ${e.message}`, { module: 'activity', event: '奶茶活动自动', result: 'error', action: steps[index].action });
            }
        }
    }
    return { runMilkTeaAutomation };
}
module.exports = {
    createMilkTeaAutomation,
    isMilkTeaAutomationEnabled,
    MILK_TEA_AUTOMATION_KEYS,
    MILK_TEA_CHECK_INTERVAL_MS,
    MILK_TEA_TASK_SPACER_MS,
};
//# sourceMappingURL=milk-tea-auto.js.map