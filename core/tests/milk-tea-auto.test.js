const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createMilkTeaAutomation,
    isMilkTeaAutomationEnabled,
    MILK_TEA_AUTOMATION_KEYS,
    MILK_TEA_CHECK_INTERVAL_MS,
} = require('../dist/services/milk-tea-auto');
const {
    ALLOWED_AUTOMATION_KEYS,
    DEFAULT_ACCOUNT_CONFIG,
    normalizeAccountConfig,
} = require('../dist/models/store/shared-state');

const DAY_MS = 24 * 3600;

function shopState(overrides = {}) {
    return {
        active: true,
        settling: false,
        summary: { shop_open_at: 1790000000, level: 2, can_upgrade: false },
        shop: { pending_rewards: [{ id: 1001, count: 120, name: '金币' }] },
        ...overrides,
    };
}

function workState(overrides = {}) {
    return {
        active: true,
        summary: { shop_open_at: 1790000000 },
        work: { slips: [{ wage_status: 1 }] },
        ...overrides,
    };
}

function fundState(overrides = {}) {
    return {
        active: true,
        summary: { shop_open_at: 1790000000 },
        fund: { unlocked: true, tiers: [{ id: 1, state: 2 }] },
        ...overrides,
    };
}

function shareState(overrides = {}) {
    return {
        active: true,
        canClaimDaily: true,
        canShare: true,
        canClaimMilestones: true,
        ...overrides,
    };
}

/**
 * 页面读取按 page 给状态，分享奖励按 activity_id 给状态；两者都可以传 Error 来模拟读失败。
 */
function harness({ pages, share, operate, operateShare, serverTime = 1790260000 } = {}) {
    const logs = [];
    const reads = [];
    const operations = [];
    const shareReads = [];
    const shareOperations = [];
    let now = serverTime;
    const automation = createMilkTeaAutomation({
        getMilkTeaActivity: async (page) => {
            reads.push(page);
            const state = pages?.[page] ?? { active: true, summary: {}, shop: {}, work: {}, fund: {} };
            if (state instanceof Error) throw state;
            return typeof state === 'function' ? state(page) : state;
        },
        operateMilkTeaActivity: async (action) => {
            operations.push(action);
            if (operate) {
                const outcome = operate(action);
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
            return { rewards: [{ name: '奶茶券', count: 3 }] };
        },
        getShareRewardActivity: async (activityId) => {
            shareReads.push(activityId);
            const state = share?.[activityId];
            if (state instanceof Error) throw state;
            return state ?? null;
        },
        operateShareRewardActivity: async (activityId, action) => {
            shareOperations.push({ activityId, action });
            if (operateShare) {
                const outcome = operateShare(action);
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
            return { rewards: [{ name: '快乐值', count: 10 }] };
        },
        getServerTimeSec: () => now,
        log: (module, message, meta) => logs.push({ module, message, meta }),
    });
    return {
        automation,
        logs,
        reads,
        operations,
        shareReads,
        shareOperations,
        skipLogs: () => logs.filter(entry => entry.meta?.result === 'skip'),
        errorLogs: () => logs.filter(entry => entry.meta?.result === 'error'),
        advanceDay: (days = 1) => { now += days * DAY_MS; },
    };
}

const FLAGS = {
    claimRewards: true,
    claimWages: true,
    claimFund: true,
    happyDaily: true,
    happyShare: true,
    happyMilestones: true,
};

test('只有取到证据的六个领取动作有开关位', () => {
    assert.deepEqual([...MILK_TEA_AUTOMATION_KEYS].sort(), [
        'milk_tea_claim_fund',
        'milk_tea_claim_rewards',
        'milk_tea_claim_wages',
        'milk_tea_happy_daily',
        'milk_tea_happy_milestones',
        'milk_tea_happy_share',
    ].sort());
    // 要人选、要花东西、要实服证据的动作一律不预建开关：空转开关比没有开关更坏。
    for (const forbidden of ['create', 'rename', 'craft', 'hire', 'boost', 'exchange', 'upgrade', 'interact', 'logs', 'rank', 'workshop']) {
        assert.equal(MILK_TEA_AUTOMATION_KEYS.some(key => key.includes(forbidden)), false, forbidden);
    }
    assert.equal(MILK_TEA_CHECK_INTERVAL_MS, 30 * 60 * 1000);
});

test('六个开关都能穿过配置白名单存进去', () => {
    for (const key of MILK_TEA_AUTOMATION_KEYS) {
        assert.equal(ALLOWED_AUTOMATION_KEYS.has(key), true, key);
        assert.equal(DEFAULT_ACCOUNT_CONFIG.automation[key], false, key);
    }
    const saved = normalizeAccountConfig({
        automation: { milk_tea_claim_rewards: true, milk_tea_happy_share: 'on', milk_tea_claim_wages: 1 },
    }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(saved.milk_tea_claim_rewards, true);
    assert.equal(saved.milk_tea_happy_share, true);
    assert.equal(saved.milk_tea_claim_wages, true);
    // 界面上没出现过的动作不该跟着别人一起打开。
    assert.equal(saved.milk_tea_claim_fund, false);
    assert.equal(isMilkTeaAutomationEnabled({}), false);
    assert.equal(isMilkTeaAutomationEnabled({ milk_tea_claim_wages: true }), true);
});

test('每个开关只在打开时执行自己那一项', async () => {
    const pages = { shop: shopState(), work: workState(), fund: fundState() };
    const only = { ...FLAGS, claimRewards: false, claimWages: false, claimFund: false, happyDaily: false, happyShare: false };
    const h = harness({ pages, share: { 2026110104: shareState() } });
    await h.automation.runMilkTeaAutomation(only);
    assert.deepEqual(h.operations, []);
    assert.deepEqual(h.shareOperations.map(v => v.action), ['milestones']);
    assert.deepEqual(h.shareReads, ['2026110104']);

    const all = harness({ pages, share: { 2026110104: shareState() } });
    await all.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(all.operations, ['claim', 'wages', 'fundClaim']);
    assert.deepEqual(all.shareOperations.map(v => v.action), ['daily', 'share', 'milestones']);
});

test('店铺没开业、活动不在开放期都只跳过不发写请求', async () => {
    const h = harness({ pages: {
        shop: shopState({ summary: { shop_open_at: 0 } }),
        work: workState({ active: false }),
        fund: fundState(),
    }, share: { 2026110104: shareState({ active: false }), 2026092501: shareState({ active: false }) } });
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(h.operations, ['fundClaim']);
    assert.deepEqual(h.shareOperations, []);
    const skipped = h.skipLogs().map(entry => entry.meta.action);
    assert.ok(skipped.includes('claim'));
    assert.ok(skipped.includes('wages'));
    assert.ok(skipped.includes('share_reward'));
});

test('服务端说没得领就不发请求，同一天的重复跳过只记一行', async () => {
    const pages = {
        shop: shopState({ shop: { pending_rewards: [{ id: 1001, count: 0 }] } }),
        work: workState({ work: { slips: [{ wage_status: 2 }] } }),
        fund: fundState({ fund: { unlocked: true, tiers: [{ id: 1, state: 1 }] } }),
    };
    const h = harness({ pages, share: { 2026110104: shareState({ canClaimDaily: false, canShare: false, canClaimMilestones: false }) } });
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(h.operations, []);
    assert.deepEqual(h.shareOperations, []);
    assert.equal(h.skipLogs().length, 6);
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.equal(h.skipLogs().length, 6, '同一天再跑一轮不该重复记跳过');
    h.advanceDay();
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.equal(h.skipLogs().length, 12);
});

test('成长基金只领已达档位，没解锁时不会替用户花钱', async () => {
    const locked = harness({ pages: { fund: fundState({ fund: { unlocked: false, costs: [{ id: 1004, count: 300 }], tiers: [] } }) } });
    await locked.automation.runMilkTeaAutomation({ ...FLAGS, claimRewards: false, claimWages: false, happyDaily: false, happyShare: false, happyMilestones: false });
    assert.deepEqual(locked.operations, []);
    assert.ok(locked.skipLogs().some(entry => entry.message.includes('解锁')));
});

test('本期实例从新到旧找，旧期不在开放时间不会拦住新一期', async () => {
    const h = harness({ pages: {}, share: { 2026110104: shareState(), 2026092501: shareState({ active: false }) } });
    await h.automation.runMilkTeaAutomation({ ...FLAGS, claimRewards: false, claimWages: false, claimFund: false });
    assert.deepEqual(h.shareReads, ['2026110104']);
    assert.deepEqual(h.shareOperations.map(v => v.activityId), ['2026110104', '2026110104', '2026110104']);
});

test('单项失败不牵连同一轮里的其它领取，也绝不自己重试', async () => {
    const h = harness({
        pages: { shop: shopState(), work: workState(), fund: fundState() },
        share: { 2026110104: shareState() },
        operate: (action) => {
            if (action === 'claim') return new Error('回包不完整');
            return { rewards: [] };
        },
        operateShare: (action) => (action === 'share' ? new Error('活动已结束') : { rewards: [] }),
    });
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(h.operations, ['claim', 'wages', 'fundClaim']);
    assert.deepEqual(h.shareOperations.map(v => v.action), ['daily', 'share', 'milestones']);
    assert.equal(h.errorLogs().length, 2);
});

test('页面读取失败只记错误，不会把其它任务一起带走', async () => {
    const h = harness({
        pages: { shop: new Error('连接已断开'), work: workState(), fund: fundState() },
        share: { 2026110104: new Error('活动目录回包不匹配') },
    });
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(h.operations, ['wages', 'fundClaim']);
    assert.equal(h.errorLogs().length, 2);
});
