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

// 六个领取动作。会花东西的四项和工作互动单独用 WORK_FLAGS 打开，避免既有断言把它们的
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
    workInteract: false,
};

// 关掉全部十一个开关的基线，再按用例单独打开一项，断言里就不会混进别的动作的请求。
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
    workInteract: false,
};

const only = (key) => ({ ...IDLE, [key]: true });

const WORK_FLAGS = { ...IDLE, craft: true, hire: true, upgrade: true, boost: true };

// 十一个开关全开。
const ALL_FLAGS = { ...FLAGS, craft: true, hire: true, upgrade: true, boost: true, workInteract: true };

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

// 「我的工作」页的形态跟 normalizeMilkTeaWork 一致：my_shift 是别人雇我当班的班次，
// interact_done 是这一班/今天有没有互动过，interactions 是五项互动各自的 ready 标记。
function myShift(overrides = {}) {
    return {
        shift_id: '70001',
        begin_at: 1790260000,
        end_at: 1790274400,
        interact_limit: 2,
        interact_count: 0,
        employer: { gid: '88001', name: '甲老板' },
        shop_name: '甲的奶茶店',
        ...overrides,
    };
}

function jobState(overrides = {}) {
    const { work: workOverrides, ...rest } = overrides;
    return {
        active: true,
        settling: false,
        summary: { shop_open_at: 1790000000 },
        work: { slips: [], interact_done: false, my_shift: myShift(), ...workOverrides },
        interactions: [1, 2, 3, 4, 5].map(id => ({ interaction_id: id, name: `互动 ${id}`, ready: true })),
        ...rest,
    };
}

test('六个领取加五个会花东西/要上班的动作有开关位', () => {
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
        'milk_tea_work_interact',
        'milk_tea_upgrade',
    ].sort());
    // 要用户拿主意的动作仍然不预建开关：空转开关比没有开关更坏。
    for (const forbidden of ['create', 'rename', 'unlock', 'hire_setting', 'logs', 'rank', 'workshop', 'seed']) {
        assert.equal(MILK_TEA_AUTOMATION_KEYS.some(key => key.includes(forbidden)), false, forbidden);
    }
    assert.equal(MILK_TEA_CHECK_INTERVAL_MS, 30 * 60 * 1000);
});

test('十一个开关都能穿过配置白名单存进去，且默认是开的', () => {
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

test('雇佣的三个选法配置能存进白名单，默认是最短档＋不限特长＋带机器人，非法值被归一化挡掉', () => {
    const keys = ['milk_tea_hire_duration_id', 'milk_tea_hire_talent_id', 'milk_tea_hire_allow_robots'];
    for (const key of keys) assert.equal(ALLOWED_AUTOMATION_KEYS.has(key), true, key);
    assert.deepEqual(
        keys.map(key => DEFAULT_ACCOUNT_CONFIG.automation[key]),
        [1, 0, true],
        '默认按活动页的初始选择走：最短一档、不限特长、机器人也算候选',
    );
    const saved = normalizeAccountConfig({
        automation: { milk_tea_hire_duration_id: 3, milk_tea_hire_talent_id: 9002, milk_tea_hire_allow_robots: false },
    }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(saved.milk_tea_hire_duration_id, 3);
    assert.equal(saved.milk_tea_hire_talent_id, 9002);
    assert.equal(saved.milk_tea_hire_allow_robots, false);
    // 老配置里没写这三项时继承默认，不会被布尔化（automation 里非布尔的 key 由 normalizeAccountConfig 特殊处理）。
    const inherited = normalizeAccountConfig({ automation: { milk_tea_craft: false } }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(inherited.milk_tea_hire_duration_id, 1);
    assert.equal(inherited.milk_tea_hire_talent_id, 0);
    assert.equal(inherited.milk_tea_hire_allow_robots, true);
    // 存坏了的值（第 9 档、不存在的特长）在落库这一步就被夹回默认，不会跟着配置发到服务端。
    const broken = normalizeAccountConfig({
        automation: { milk_tea_hire_duration_id: 9, milk_tea_hire_talent_id: 9999, milk_tea_hire_allow_robots: 'yes' },
    }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(broken.milk_tea_hire_duration_id, 1);
    assert.equal(broken.milk_tea_hire_talent_id, 0);
    assert.equal(broken.milk_tea_hire_allow_robots, true);
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

test('四个会花东西的动作和工作互动在开关关闭时一笔都不发', async () => {
    const h = harness({ pages: { ...WORK_PAGES(), shop: shopState(), work: workState(), fund: fundState() }, share: { 2026110104: shareState() } });
    await h.automation.runMilkTeaAutomation(FLAGS);
    assert.deepEqual(h.operations, ['claim', 'wages', 'fundClaim']);
    assert.equal(h.calls.some(v => ['craft', 'hire', 'upgrade', 'boost', 'interact'].includes(v.action)), false);
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

test('雇佣的四种情况都不发写请求：没空位、只有机器人且关了机器人、奶茶券不够、班次时间不够', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const full = hireState(eligible, { shop: { slots: [{ slot_index: 0, end_at: 1790900000 }, { slot_index: 1, end_at: 1790900000 }] } });
    const h1 = harness({ pages: { hireList: full } });
    await h1.automation.runMilkTeaAutomation(only('hire'));
    assert.deepEqual(h1.operations, []);
    assert.ok(h1.skipLogs().some(entry => entry.message.includes('员工位置')));

    const robots = hireState([], { hire: { robots: [{ friend: { gid: '20001' }, state: 0, rehire_available_at: 0, is_robot: true }] } });
    const h2 = harness({ pages: { hireList: robots } });
    await h2.automation.runMilkTeaAutomation({ ...only('hire'), hireAllowRobots: false });
    assert.deepEqual(h2.operations, []);
    assert.ok(h2.skipLogs().some(entry => entry.message.includes('机器人候选已关闭')));

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

test('机器人候选默认在池子里：好友没雇位可雇时雇机器人，日志里标出是机器人', async () => {
    const onlyRobot = hireState([], { hire: { robots: [{ friend: { gid: '20001', name: '实习员工' }, state: 0, rehire_available_at: 0, is_robot: true, talent_id: 9004, talent_name: '默默搬砖' }] } });
    const h = harness({ pages: { hireList: onlyRobot } });
    await h.automation.runMilkTeaAutomation(only('hire'));
    assert.deepEqual(h.calls.map(v => v.action), ['hire']);
    assert.equal(h.calls[0].input.targetGid, '20001');
    assert.ok(h.logs.some(entry => entry.message.includes('实习员工（机器人）') && entry.message.includes('默默搬砖')));

    // 关掉头选以后这一位就不该再动。
    const off = harness({ pages: { hireList: onlyRobot } });
    await off.automation.runMilkTeaAutomation({ ...only('hire'), hireAllowRobots: false });
    assert.deepEqual(off.operations, []);
});

test('雇佣的班次档数从配置进读请求，也原样报给服务端', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const pages = { hireList: hireState(eligible, { hire: { friends: eligible, robots: [], wage_total: 270, min_remain_biz_sec: 43201, duration_id: 3 }, durations: [{ duration_id: 3, duration_sec: 86400 }] }) };
    const h = harness({ pages });
    await h.automation.runMilkTeaAutomation({ ...only('hire'), hireDurationId: 3 });
    assert.deepEqual(h.pageInputs.find(v => v.page === 'hireList').input, { durationId: 3 }, '读页面要按所选档报价');
    assert.deepEqual(h.calls.map(v => v.input), [{ slotIndex: 0, targetGid: '10001', durationId: 3, expectedCosts: [{ id: 1041, count: 270 }] }]);
    assert.ok(h.logs.some(entry => entry.message.includes('24 小时班次') && entry.message.includes('花 270 奶茶券')));

    // 非法档数（配置被手改坏、老配置里的空值）一律回到最短一档，不会报一个服务端不认的档。
    const bad = harness({ pages });
    await bad.automation.runMilkTeaAutomation({ ...only('hire'), hireDurationId: 7 });
    assert.deepEqual(bad.pageInputs.find(v => v.page === 'hireList').input, { durationId: 1 });
});

test('选了特长只雇这一档，这一档没人就只记跳过，不会退回去雇别人', async () => {
    const friends = [
        { friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0, talent_id: 9001, talent_name: '金牌销售' },
        { friend: { gid: '10002', name: '乙' }, state: 0, rehire_available_at: 0, talent_id: 9002, talent_name: '金牌宣传' },
    ];
    const pages = { hireList: hireState(friends) };
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
        const h = harness({ pages });
        await h.automation.runMilkTeaAutomation({ ...only('hire'), hireTalentId: 9002 });
        seen.add(h.calls.find(v => v.action === 'hire').input.targetGid);
    }
    assert.deepEqual([...seen], ['10002'], '金牌宣传档里只有乙，不该轮到别人');

    const nobody = harness({ pages });
    await nobody.automation.runMilkTeaAutomation({ ...only('hire'), hireTalentId: 9003 });
    assert.deepEqual(nobody.operations, []);
    assert.ok(nobody.skipLogs().some(entry => entry.message.includes('金牌服务')));

    // 非法特长 id 回到「不限」，不该因为配置写错就一位都不雇。
    const bad = harness({ pages });
    await bad.automation.runMilkTeaAutomation({ ...only('hire'), hireTalentId: 1234 });
    assert.equal(bad.calls.find(v => v.action === 'hire').input.targetGid.length > 0, true);
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

test('被雇到别人的店就选花式摇杯（interaction_id 2），班次 id 原样传给服务端复核', async () => {
    const h = harness({ pages: { work: jobState() } });
    await h.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(h.calls, [{ action: 'interact', input: { interactionType: 2, expectedShiftId: '70001' } }]);
    assert.ok(h.logs.some(entry => entry.message.includes('工作互动·花式摇杯（在 甲老板 的店，本班还剩 2 次）')));
});

test('没有被雇的班次、这一班已经互动过、已经下班、次数用完时都只跳过，不发互动', async () => {
    const noShift = harness({ pages: { work: jobState({ work: { my_shift: null } }) } });
    await noShift.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(noShift.operations, []);
    assert.ok(noShift.skipLogs().some(entry => entry.meta.action === 'work_interact' && entry.message.includes('没有被雇佣的班次')));

    const done = harness({ pages: { work: jobState({ work: { interact_done: true } }) } });
    await done.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(done.operations, []);
    assert.ok(done.skipLogs().some(entry => entry.message.includes('互动已经做过')));

    // end_at 已经过点：这一班下了班，互动做了也不结算
    const offDuty = harness({ pages: { work: jobState({ work: { my_shift: myShift({ end_at: 1790259999 }) } }) } });
    await offDuty.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(offDuty.operations, []);
    assert.ok(offDuty.skipLogs().some(entry => entry.message.includes('已经下班')));

    const usedUp = harness({ pages: { work: jobState({ work: { my_shift: myShift({ interact_count: 2 }) } }) } });
    await usedUp.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(usedUp.operations, []);
    assert.ok(usedUp.skipLogs().some(entry => entry.message.includes('互动次数已用完')));
});

test('花式摇杯这一项数据不完整、结算期、还没开业时都不互动，等下一轮', async () => {
    const noReady = harness({ pages: { work: jobState({ interactions: [{ interaction_id: 1, name: '宣传推广', ready: true }] }) } });
    await noReady.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(noReady.operations, []);
    assert.ok(noReady.skipLogs().some(entry => entry.message.includes('花式摇杯的工作事项数据不完整')));

    const notReady = harness({ pages: { work: jobState({ interactions: [{ interaction_id: 2, name: '花式摇杯', ready: false }] }) } });
    await notReady.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(notReady.operations, []);

    const settling = harness({ pages: { work: jobState({ settling: true }) } });
    await settling.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(settling.operations, []);
    assert.ok(settling.skipLogs().some(entry => entry.message.includes('结算期不可互动')));

    // 还没开业时服务端连打工入口都不给，读一眼就跳过
    const closed = harness({ pages: { work: jobState({ summary: { shop_open_at: 0 } }) } });
    await closed.automation.runMilkTeaAutomation(only('workInteract'));
    assert.deepEqual(closed.operations, []);
    assert.ok(closed.skipLogs().some(entry => entry.message.includes('还没开业')));
});

test('四个会花东西的动作和工作互动里任何一笔失败都不会带走同一轮里的其它动作', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const h = harness({ pages: {
        workshop: craftState([{ id: 2001, uid: 'u1', count: 1 }]),
        hireList: hireState(eligible),
        upgrade: { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 3, can_upgrade: true } },
        shop: boostState(95, 30, 500),
        work: jobState(),
    }, operate: (action) => (action === 'craft' ? new Error('果实数量或锁定状态已变化') : { rewards: [] }) });
    await h.automation.runMilkTeaAutomation({ ...WORK_FLAGS, workInteract: true });
    assert.deepEqual(h.operations, ['craft', 'hire', 'upgrade', 'boost', 'interact']);
    assert.equal(h.errorLogs().length, 1);
    assert.equal(h.errorLogs()[0].meta.action, 'craft');
});

test('十一个任务串行执行、任务之间休眠，不并发压连接', async () => {
    const eligible = [{ friend: { gid: '10001', name: '甲' }, state: 0, rehire_available_at: 0 }];
    const pages = {
        shop: shopState({
            shop: { pending_rewards: [{ id: 1001, count: 120, name: '金币' }], sales_item_id: 1042, boost_cups_per_use: 30, pending_cups_by_recipe: { 1: 95 }, is_settling: false },
            balances: { 1042: 500 },
        }),
        work: jobState({ work: { slips: [{ wage_status: 1 }] } }),
        fund: fundState(),
        workshop: craftState([{ id: 2001, uid: 'u1', count: 2, name: '草莓' }]),
        hireList: hireState(eligible),
        upgrade: { active: true, settling: false, summary: { shop_open_at: 1790000000, level: 3, can_upgrade: true } },
    };
    const h = harness({ pages, share: { 2026110104: shareState() } });
    const started = Date.now();
    await h.automation.runMilkTeaAutomation(ALL_FLAGS);
    assert.equal(h.maxInflight(), 1, '同时只能有一个请求在飞');
    // 九个步骤（三个快乐值领取算一步），步骤之间各隔一次 MILK_TEA_TASK_SPACER_MS。
    assert.ok(Date.now() - started >= 8 * MILK_TEA_TASK_SPACER_MS, `十一项之间只隔了 ${Date.now() - started}ms`);
    // 读一页做一项，按开关列出的顺序走，不会两组请求交错着发。领工资和工作互动共用「我的工作」那一页，各读各的。
    assert.deepEqual(h.reads, ['shop', 'work', 'fund', 'workshop', 'hireList', 'upgrade', 'shop', 'work']);
    assert.deepEqual(h.operations, ['claim', 'wages', 'fundClaim', 'craft', 'hire', 'upgrade', 'boost', 'interact']);
    assert.deepEqual(h.shareOperations.map(v => v.action), ['daily', 'share', 'milestones']);
});
