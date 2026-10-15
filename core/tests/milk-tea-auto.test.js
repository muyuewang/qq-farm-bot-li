const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createMilkTeaAutomation,
    isMilkTeaAutomationEnabled,
    MILK_TEA_AUTOMATION_KEYS,
    MILK_TEA_CHECK_INTERVAL_MS,
    MILK_TEA_TASK_SPACER_MS,
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
    const pageInputs = [];
    const operations = [];
    const calls = [];
    const shareReads = [];
    const shareOperations = [];
    let now = serverTime;
    // 同时在进行中的请求数：用来证明十项是排队跑的，不是并发压在同一根连接上。
    let inflight = 0;
    let maxInflight = 0;
    const track = async (run) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        try {
            return await run();
        }
        finally {
            inflight--;
        }
    };
    const automation = createMilkTeaAutomation({
        getMilkTeaActivity: async (page, input) => track(async () => {
            reads.push(page);
            pageInputs.push({ page, input: input || {} });
            const state = pages?.[page] ?? { active: true, summary: {}, shop: {}, work: {}, fund: {} };
            if (state instanceof Error) throw state;
            return typeof state === 'function' ? state(page) : state;
        }),
        operateMilkTeaActivity: async (action, input) => track(async () => {
            operations.push(action);
            calls.push({ action, input: input || {} });
            if (operate) {
                const outcome = operate(action);
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
            return { rewards: [{ name: '奶茶券', count: 3 }] };
        }),
        getShareRewardActivity: async (activityId) => track(async () => {
            shareReads.push(activityId);
            const state = share?.[activityId];
            if (state instanceof Error) throw state;
            return state ?? null;
        }),
        operateShareRewardActivity: async (activityId, action) => track(async () => {
            shareOperations.push({ activityId, action });
            if (operateShare) {
                const outcome = operateShare(action);
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
            return { rewards: [{ name: '快乐值', count: 10 }] };
        }),
        getServerTimeSec: () => now,
        log: (module, message, meta) => logs.push({ module, message, meta }),
    });
    return {
        automation,
        logs,
        reads,
        pageInputs,
        operations,
        calls,
        shareReads,
        shareOperations,
        maxInflight: () => maxInflight,
        skipLogs: () => logs.filter(entry => entry.meta?.result === 'skip'),
        errorLogs: () => logs.filter(entry => entry.meta?.result === 'error'),
        advanceDay: (days = 1) => { now += days * DAY_MS; },
    };
}

// 六个领取动作。新加的四个会花东西，单独用 WORK_FLAGS 打开，避免既有断言把它们的
// 请求混进「只该发这一笔」的清单里。
const FLAGS = {
    claimRewards: true,
    claimWages: true,
    claimFund: true,
    happyDaily: true,
    happyShare: true,
    happyMilestones: true,
    craft: false,
    hire: false,
    upgrade: false,
    boost: false,
};

// 关掉全部十个开关的基线，再按用例单独打开一项，断言里就不会混进别的动作的请求。
const IDLE = {
    claimRewards: false,
    claimWages: false,
    claimFund: false,
    happyDaily: false,
    happyShare: false,
    happyMilestones: false,
    craft: false,
    hire: false,
    upgrade: false,
    boost: false,
};

const only = (key) => ({ ...IDLE, [key]: true });

const WORK_FLAGS = { ...IDLE, craft: true, hire: true, upgrade: true, boost: true };

// 十个开关全开。
const ALL_FLAGS = { ...FLAGS, craft: true, hire: true, upgrade: true, boost: true };

function craftState(fruits, overrides = {}) {
    return { active: true, settling: false, summary: { shop_open_at: 1790000000 }, fruits, ...overrides };
}

function hireState(friends = [], overrides = {}) {
    const { hire, ...rest } = overrides;
    return {
        active: true,
        settling: false,
        summary: { shop_open_at: 1790000000, level: 2 },
        levels: [{ level: 2, employee_slot_count: 2 }],
        shop: { slots: [] },
        hire: { friends, robots: [], wage_total: 60, min_remain_biz_sec: 0, ...hire },
        balances: { 1041: 500 },
        settleStartTime: 1790900000,
        ...rest,
    };
}

function boostState(pending, perUse, owned, overrides = {}) {
    return {
        active: true,
        settling: false,
        summary: { shop_open_at: 1790000000 },
        shop: { sales_item_id: 1042, boost_cups_per_use: perUse, pending_cups_by_recipe: { 1: pending }, is_settling: false },
        balances: { 1042: owned },
        ...overrides,
    };
}

test('六个领取加四个用户给定选法的动作有开关位', () => {
    assert.deepEqual([...MILK_TEA_AUTOMATION_KEYS].sort(), [
        'milk_tea_boost',
        'milk_tea_craft',
        'milk_tea_claim_fund',
        'milk_tea_claim_rewards',
        'milk_tea_claim_wages',
        'milk_tea_happy_daily',
        'milk_tea_happy_milestones',
        'milk_tea_happy_share',
        'milk_tea_hire',
        'milk_tea_upgrade',
    ].sort());
    // 要用户拿主意的动作仍然不预建开关：空转开关比没有开关更坏。
    for (const forbidden of ['create', 'rename', 'exchange', 'interact', 'unlock', 'hire_setting', 'logs', 'rank', 'workshop']) {
        assert.equal(MILK_TEA_AUTOMATION_KEYS.some(key => key.includes(forbidden)), false, forbidden);
    }
    assert.equal(MILK_TEA_CHECK_INTERVAL_MS, 30 * 60 * 1000);
});

test('十个开关都能穿过配置白名单存进去，且默认是开的', () => {
    for (const key of MILK_TEA_AUTOMATION_KEYS) {
        assert.equal(ALLOWED_AUTOMATION_KEYS.has(key), true, key);
        assert.equal(DEFAULT_ACCOUNT_CONFIG.automation[key], true, key);
    }
    const saved = normalizeAccountConfig({
        automation: { milk_tea_claim_rewards: true, milk_tea_happy_share: 'on', milk_tea_claim_wages: 1 },
    }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(saved.milk_tea_claim_rewards, true);
    assert.equal(saved.milk_tea_happy_share, true);
    assert.equal(saved.milk_tea_claim_wages, true);
    // 活动进行中默认全开：配置里没写出来的奶茶 key 继承默认（开），要关必须显式写 false。
    assert.equal(saved.milk_tea_claim_fund, true);
    const off = normalizeAccountConfig({
        automation: { milk_tea_boost: false, milk_tea_hire: 0 },
    }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(off.milk_tea_boost, false);
    assert.equal(off.milk_tea_hire, false);
    assert.equal(off.milk_tea_craft, true);
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

const WORK_PAGES = () => ({
    workshop: craftState([]),
    hireList: hireState(),
    upgrade: { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 3, can_upgrade: true } },
    shop: boostState(95, 30, 500),
});

test('四个会花东西的动作在开关关闭时一笔都不发', async () => {
    const h = harness({ pages: { ...WORK_PAGES(), shop: shopState(), work: workState(), fund: fundState() }, share: { 2026110104: shareState() } });
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(h.operations, ['claim', 'wages', 'fundClaim']);
    assert.equal(h.calls.some(v => ['craft', 'hire', 'upgrade', 'boost'].includes(v.action)), false);
    // 关掉的动作连状态都不该去读，省下的是一次活动页请求。
    for (const page of ['workshop', 'hireList', 'upgrade']) {
        assert.equal(h.reads.includes(page), false, page);
    }
});

test('制作按果实分组、组内保持背包顺序，uid 和数量原样传给服务端复核', async () => {
    const fruits = [
        { id: 2001, uid: 'u1', count: 3, name: '草莓', locked: false },
        { id: 2002, uid: 'u2', count: 2, name: '蓝莓', locked: false },
        { id: 2001, uid: 'u3', count: 5, name: '草莓', locked: false },
        { id: 2003, uid: 'u4', count: 1, name: '芒果', locked: true },
        { id: 2004, uid: 'u5', count: 0, name: '葡萄', locked: false },
    ];
    const h = harness({ pages: { workshop: craftState(fruits) } });
    await h.automation.runMilkTeaAutomation(only('craft'));
    const crafts = h.calls.filter(v => v.action === 'craft').map(v => v.input.fruits);
    assert.deepEqual(crafts, [
        [{ uid: 'u1', count: 3 }, { uid: 'u3', count: 5 }],
        [{ uid: 'u2', count: 2 }],
    ]);
    // 已锁定的、没库存的都不能进请求，否则服务端会回「果实数量或锁定状态已变化」。
    assert.ok(h.logs.some(entry => entry.message === '制作奶茶（草莓 ×8）完成，获得 奶茶券x3'));
});

test('制作每轮最多 6 次、每次最多 20 堆，剩下的下一轮继续', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: 2001, uid: `x${i}`, count: 1, name: '草莓', locked: false }));
    const batched = harness({ pages: { workshop: craftState(many) } });
    await batched.automation.runMilkTeaAutomation(only('craft'));
    const sizes = batched.calls.filter(v => v.action === 'craft').map(v => v.input.fruits.length);
    assert.deepEqual(sizes, [20, 5]);
    assert.equal(batched.skipLogs().some(entry => entry.message.includes('上限')), false);

    const capped = harness({ pages: { workshop: craftState(Array.from({ length: 8 }, (_, i) => ({ id: 2100 + i, uid: `y${i}`, count: 1, name: `果${i}`, locked: false }))) } });
    await capped.automation.runMilkTeaAutomation(only('craft'));
    assert.equal(capped.calls.filter(v => v.action === 'craft').length, 6);
    assert.ok(capped.skipLogs().some(entry => entry.meta.action === 'craft' && entry.message.includes('上限 6 次')));
});

test('背包里没有能做的果实就跳过，不发制作请求', async () => {
    const h = harness({ pages: { workshop: craftState([{ id: 2001, uid: 'u1', count: 2, locked: true }]) } });
    await h.automation.runMilkTeaAutomation(only('craft'));
    assert.deepEqual(h.operations, []);
    assert.ok(h.skipLogs().some(entry => entry.message.includes('没有可制作的果实')));

    const settling = harness({ pages: { workshop: craftState([{ id: 2001, uid: 'u1', count: 2 }], { settling: true }) } });
    await settling.automation.runMilkTeaAutomation(only('craft'));
    assert.deepEqual(settling.operations, []);
    assert.ok(settling.skipLogs().some(entry => entry.message.includes('结算期')));
});

test('雇佣取第一个空位，在可雇的好友里随机，报价按最短一档的工资', async () => {
    const friends = [
        { friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 },
        { friend: { gid: '10002', name: '乙' }, state: 0, rehire_available_at: 0 },
        { friend: { gid: '10003', name: '丙' }, state: 1, rehire_available_at: 0 },
        { friend: { gid: '10004', name: '丁' }, state: 0, rehire_available_at: 1799999999 },
        { friend: { gid: '0', name: '坏 gid' }, state: 0, rehire_available_at: 0 },
    ];
    const pages = { hireList: hireState(friends, { shop: { slots: [{ slot_index: 0, end_at: 1790900000 }] } }) };
    const h = harness({ pages });
    await h.automation.runMilkTeaAutomation(only('hire'));
    const call = h.calls.find(v => v.action === 'hire');
    assert.equal(call.input.slotIndex, 1, '0 号位当班中，应挑第一个空位');
    assert.equal(call.input.durationId, 1);
    assert.deepEqual(call.input.expectedCosts, [{ id: 1041, count: 60 }]);
    assert.deepEqual(h.pageInputs.find(v => v.page === 'hireList').input, { durationId: 1 });
    assert.ok(['10001', '10002'].includes(call.input.targetGid));

    // 随机确实会换人：30 轮里不该总盯着同一个好友。
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
        const round = harness({ pages });
        await round.automation.runMilkTeaAutomation(only('hire'));
        seen.add(round.calls.find(v => v.action === 'hire').input.targetGid);
    }
    assert.equal(seen.size > 1, true, [...seen].join(','));
});

test('雇佣的四种情况都不发写请求：没空位、只有机器人、奶茶券不够、班次时间不够', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const full = hireState(eligible, { shop: { slots: [{ slot_index: 0, end_at: 1790900000 }, { slot_index: 1, end_at: 1790900000 }] } });
    const h1 = harness({ pages: { hireList: full } });
    await h1.automation.runMilkTeaAutomation(only('hire'));
    assert.deepEqual(h1.operations, []);
    assert.ok(h1.skipLogs().some(entry => entry.message.includes('员工位置')));

    const robots = hireState([], { hire: { robots: [{ friend: { gid: '20001' }, state: 0, rehire_available_at: 0, is_robot: true }] } });
    const h2 = harness({ pages: { hireList: robots } });
    await h2.automation.runMilkTeaAutomation(only('hire'));
    assert.deepEqual(h2.operations, []);
    assert.ok(h2.skipLogs().some(entry => entry.message.includes('好友列表里没有')));

    const broke = hireState(eligible, { balances: { 1041: 10 } });
    const h3 = harness({ pages: { hireList: broke } });
    await h3.automation.runMilkTeaAutomation(only('hire'));
    assert.deepEqual(h3.operations, []);
    assert.ok(h3.skipLogs().some(entry => entry.message.includes('奶茶券不足')));

    const late = hireState(eligible, { settleStartTime: 1790260010, hire: { min_remain_biz_sec: 3600 } });
    const h4 = harness({ pages: { hireList: late } });
    await h4.automation.runMilkTeaAutomation(only('hire'));
    assert.deepEqual(h4.operations, []);
    assert.ok(h4.skipLogs().some(entry => entry.message.includes('剩余营业时间不足')));
});

test('升级只在看板说达标时才发，等级按刚读到的值报给服务端', async () => {
    const ready = { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 4, can_upgrade: true } };
    const h = harness({ pages: { upgrade: ready } });
    await h.automation.runMilkTeaAutomation(only('upgrade'));
    assert.deepEqual(h.calls.map(v => v.input), [{ expectedLevel: 4 }]);

    const notYet = { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 4, can_upgrade: false } };
    const off = harness({ pages: { upgrade: notYet } });
    await off.automation.runMilkTeaAutomation(only('upgrade'));
    assert.deepEqual(off.operations, []);
    assert.ok(off.skipLogs().some(entry => entry.message.includes('营业额条件')));
});

test('爆单按待售杯数算喇叭用量，再用持有量和单次上限夹住', async () => {
    const cases = [[95, 30, 500, 4], [95, 30, 2, 2], [400000, 1, 400000, 9999], [30, 30, 500, 1]];
    for (const [pending, perUse, owned, expected] of cases) {
        const h = harness({ pages: { shop: boostState(pending, perUse, owned) } });
        await h.automation.runMilkTeaAutomation(only('boost'));
        assert.deepEqual(h.calls.map(v => v.input), [{ count: expected, expectedCosts: [{ id: 1042, count: 1 }] }], `${pending}/${perUse}/${owned}`);
    }

    const noPending = harness({ pages: { shop: boostState(0, 30, 500) } });
    await noPending.automation.runMilkTeaAutomation(only('boost'));
    assert.deepEqual(noPending.operations, []);
    assert.ok(noPending.skipLogs().some(entry => entry.message.includes('没有待售奶茶')));

    const noHorn = harness({ pages: { shop: boostState(95, 30, 0) } });
    await noHorn.automation.runMilkTeaAutomation(only('boost'));
    assert.deepEqual(noHorn.operations, []);
    assert.ok(noHorn.skipLogs().some(entry => entry.message.includes('宣传喇叭')));

    const settling = harness({ pages: { shop: boostState(95, 30, 500, { shop: { sales_item_id: 1042, boost_cups_per_use: 30, pending_cups_by_recipe: { 1: 95 }, is_settling: true } }) } });
    await settling.automation.runMilkTeaAutomation(only('boost'));
    assert.deepEqual(settling.operations, []);
    assert.ok(settling.skipLogs().some(entry => entry.message.includes('结算期不可爆单')));
});

test('四个新动作里任何一笔失败都不会带走同一轮里的其它动作', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const h = harness({ pages: {
        workshop: craftState([{ id: 2001, uid: 'u1', count: 1 }]),
        hireList: hireState(eligible),
        upgrade: { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 3, can_upgrade: true } },
        shop: boostState(95, 30, 500),
    }, operate: (action) => (action === 'craft' ? new Error('果实数量或锁定状态已变化') : { rewards: [] }) });
    await h.automation.runMilkTeaAutomation(WORK_FLAGS);
    assert.deepEqual(h.operations, ['craft', 'hire', 'upgrade', 'boost']);
    assert.equal(h.errorLogs().length, 1);
    assert.equal(h.errorLogs()[0].meta.action, 'craft');
});

test('十个任务串行执行、任务之间休眠，不并发压连接', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const pages = {
        shop: shopState({
            shop: { pending_rewards: [{ id: 1001, count: 120, name: '金币' }], sales_item_id: 1042, boost_cups_per_use: 30, pending_cups_by_recipe: { 1: 95 }, is_settling: false },
            balances: { 1042: 500 },
        }),
        work: workState(),
        fund: fundState(),
        workshop: craftState([{ id: 2001, uid: 'u1', count: 2, name: '草莓' }]),
        hireList: hireState(eligible),
        upgrade: { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 3, can_upgrade: true } },
    };
    const h = harness({ pages, share: { 2026110104: shareState() } });
    const started = Date.now();
    await h.automation.runMilkTeaAutomation(ALL_FLAGS);
    assert.equal(h.maxInflight(), 1, '同时只能有一个请求在飞');
    // 八个步骤（三个快乐值领取算一步），步骤之间各隔一次 MILK_TEA_TASK_SPACER_MS。
    assert.ok(Date.now() - started >= 7 * MILK_TEA_TASK_SPACER_MS, `十项之间只隔了 ${Date.now() - started}ms`);
    // 读一页做一项，按开关列出的顺序走，不会两组请求交错着发。
    assert.deepEqual(h.reads, ['shop', 'work', 'fund', 'workshop', 'hireList', 'upgrade', 'shop']);
    assert.deepEqual(h.operations, ['claim', 'wages', 'fundClaim', 'craft', 'hire', 'upgrade', 'boost']);
    assert.deepEqual(h.shareOperations.map(v => v.action), ['daily', 'share', 'milestones']);
});
