const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createAutumnAutomation,
    isAutumnAutomationEnabled,
    AUTUMN_AUTOMATION_KEYS,
    AUTUMN_CHECK_INTERVAL_MS,
} = require('../dist/services/autumn-activities-auto');
const {
    ALLOWED_AUTOMATION_KEYS,
    normalizeAccountConfig,
} = require('../dist/models/store/shared-state');

const DAY_MS = 24 * 3600;

function wishState(overrides = {}) {
    return {
        key: 'wish',
        active: true,
        remaining: 1,
        day: 1,
        pending: null,
        choices: [{ id: 5, name: '农耕' }, { id: 3, name: '前程' }],
        canDraw: true,
        canClaim: false,
        ...overrides,
    };
}

function happyState(overrides = {}) {
    return {
        key: 'happy',
        active: true,
        score: 5,
        canClaimDaily: true,
        canShare: true,
        canClaimMilestones: true,
        ...overrides,
    };
}

function harness({ wish, happy, operate, serverTime = 1790260000 } = {}) {
    const logs = [];
    const reads = [];
    const operations = [];
    let now = serverTime;
    const automation = createAutumnAutomation({
        getAutumnActivity: async (key) => {
            reads.push(key);
            const state = key === 'wish' ? wish : happy;
            if (state instanceof Error) throw state;
            return typeof state === 'function' ? state(key) : state;
        },
        operateAutumnActivity: async (key, action, input) => {
            operations.push({ key, action, input });
            if (operate) {
                const outcome = operate(action, operations.length);
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
            return { activity: null, rewards: [{ name: '烟花·玉兔望月', count: 20 }] };
        },
        getServerTimeSec: () => now,
        log: (module, message, meta) => logs.push({ module, message, meta }),
    });
    return {
        automation,
        logs,
        reads,
        operations,
        skipLogs: () => logs.filter(entry => entry.meta?.result === 'skip'),
        eventLogs: () => logs.filter(entry => entry.meta?.event === '秋日活动自动'),
        advanceDay: (days = 1) => { now += days * DAY_MS; },
    };
}

const FLAGS = {
    wishDraw: true,
    wishClaim: true,
    wishChoice: 5,
    happyDaily: true,
    happyShare: true,
    happyMilestones: true,
};

test('only the five evidenced actions get an automation key', () => {
    assert.deepEqual([...AUTUMN_AUTOMATION_KEYS].sort(), [
        'autumn_happy_daily',
        'autumn_happy_milestones',
        'autumn_happy_share',
        'autumn_wish_claim',
        'autumn_wish_draw',
    ].sort());
    // 日志查询（op 71）不改状态，不为它建开关。
    assert.equal(AUTUMN_AUTOMATION_KEYS.some(key => key.includes('logs')), false);
    assert.equal(AUTUMN_CHECK_INTERVAL_MS, 30 * 60 * 1000);
});

test('every autumn switch is wired through the config whitelist and back', () => {
    for (const key of AUTUMN_AUTOMATION_KEYS) {
        assert.equal(ALLOWED_AUTOMATION_KEYS.has(key), true, `${key} 不在白名单里，界面开了也不会生效`);
    }
    const automation = normalizeAccountConfig({
        automation: {
            autumn_wish_draw: true,
            autumn_wish_choice: '3',
            autumn_happy_daily: 'on',
        },
    }, { automation: {} }).automation;
    assert.equal(automation.autumn_wish_draw, true);
    // 方向是数字，不能被其余键的 !! 归一吃掉。
    assert.equal(automation.autumn_wish_choice, 3);
    assert.equal(automation.autumn_happy_daily, true);
    // 没在界面上出现过的开关必须落在默认关闭，不能因为走的是布尔分支就跟着别人一起打开。
    assert.equal(automation.autumn_wish_claim, false);
});

test('the gate opens for any single switch and ignores the non-boolean choice', () => {
    assert.equal(isAutumnAutomationEnabled({}), false);
    assert.equal(isAutumnAutomationEnabled({ autumn_wish_choice: 5 }), false);
    assert.equal(isAutumnAutomationEnabled({ autumn_happy_daily: true }), true);
    assert.equal(isAutumnAutomationEnabled({ autumn_wish_draw: 'true' }), false);
    for (const key of AUTUMN_AUTOMATION_KEYS) {
        assert.equal(isAutumnAutomationEnabled({ [key]: true }), true, key);
    }
});

test('wish claims the pending draw before spending a new one and reuses the write reply state', async () => {
    const afterClaim = wishState({ canDraw: false, canClaim: true, pending: { chooseId: 5 } });
    const h = harness({
        wish: wishState({ canDraw: false, canClaim: true, pending: { chooseId: 5 } }),
        operate: action => ({
            rewards: [{ name: '烟花·玉兔望月', count: 20 }],
            activity: action === 'claim' ? { ...afterClaim, canDraw: true, canClaim: false, pending: null } : null,
        }),
    });
    await h.automation.runAutumnAutomation({ ...FLAGS, happyDaily: false, happyShare: false, happyMilestones: false });
    assert.deepEqual(h.operations.map(op => op.action), ['claim', 'draw']);
    assert.deepEqual(h.operations[1].input, { chooseId: 5 });
    // 领取回包已经带了新状态，抽签判断不该再多问一次服务端。
    assert.deepEqual(h.reads, ['wish']);
    assert.deepEqual(h.eventLogs().map(entry => entry.meta.result), ['success', 'success']);
    assert.match(h.logs[0].message, /领取祈愿奖励完成，获得 烟花·玉兔望月x20/);
    assert.match(h.logs[1].message, /朝「农耕」祈愿完成/);
});

test('the daily draw fires at most once per server day even while canDraw stays true', async () => {
    const h = harness({ wish: wishState(), happy: happyState({ active: false }) });
    const only = { ...FLAGS, wishClaim: false, happyDaily: false, happyShare: false, happyMilestones: false };
    await h.automation.runAutumnAutomation(only);
    await h.automation.runAutumnAutomation(only);
    assert.equal(h.operations.length, 1);
    h.advanceDay();
    await h.automation.runAutumnAutomation(only);
    assert.equal(h.operations.length, 2);
});

test('an unconfigured wish direction is skipped instead of guessed at', async () => {
    const h = harness({ wish: wishState(), happy: null });
    await h.automation.runAutumnAutomation({ ...FLAGS, wishClaim: false, happyDaily: false, happyShare: false, happyMilestones: false, wishChoice: 99 });
    assert.deepEqual(h.operations, []);
    assert.equal(h.skipLogs().length, 1);
    assert.match(h.skipLogs()[0].message, /不在活动给出的选项里/);
});

test('each happy action is gated by its own switch', async () => {
    const h = harness({ wish: null, happy: happyState() });
    await h.automation.runAutumnAutomation({
        wishDraw: false, wishClaim: false, wishChoice: 5,
        happyDaily: true, happyShare: false, happyMilestones: false,
    });
    assert.deepEqual(h.operations.map(op => op.action), ['daily']);

    const second = harness({ wish: null, happy: happyState() });
    await second.automation.runAutumnAutomation({
        wishDraw: false, wishClaim: false, wishChoice: 5,
        happyDaily: false, happyShare: true, happyMilestones: true,
    });
    assert.deepEqual(second.operations.map(op => op.action), ['share', 'milestones']);
});

test('already-settled happy states never send a write', async () => {
    const h = harness({
        wish: wishState({ canDraw: false, canClaim: false }),
        happy: happyState({ canClaimDaily: false, canShare: false, canClaimMilestones: false }),
    });
    await h.automation.runAutumnAutomation({ ...FLAGS, wishDraw: false, wishClaim: false });
    assert.deepEqual(h.operations, []);
    assert.deepEqual(h.skipLogs().map(entry => entry.meta.action), ['happy_daily', 'happy_share', 'happy_milestones']);
});

test('a failing action does not stop the rest of the round', async () => {
    const h = harness({
        wish: wishState({ canClaim: true, canDraw: false, pending: { chooseId: 5 } }),
        happy: happyState(),
        operate: (action) => {
            if (action === 'claim') return new Error('AUTUMN_RESPONSE_INVALID');
            if (action === 'daily') return new Error('网络抖动');
            return { activity: null, rewards: [] };
        },
    });
    await h.automation.runAutumnAutomation(FLAGS);
    // 秋祈领奖炸了不影响快乐不独享继续领；快乐每日炸了也不影响分享和档位。
    assert.deepEqual(h.operations.map(op => op.action), ['claim', 'daily', 'share', 'milestones']);
    const errors = h.eventLogs().filter(entry => entry.meta.result === 'error');
    assert.deepEqual(errors.map(entry => entry.message), [
        '秋祈良愿领取祈愿奖励失败: AUTUMN_RESPONSE_INVALID',
        '快乐不独享领取每日快乐值失败: 网络抖动',
    ]);
});

test('a read failure on one activity leaves the other one running', async () => {
    const h = harness({ wish: new Error('AUTUMN_STATE_UNAVAILABLE'), happy: happyState() });
    await h.automation.runAutumnAutomation(FLAGS);
    assert.deepEqual(h.operations.map(op => [op.key, op.action]), [
        ['happy', 'daily'],
        ['happy', 'share'],
        ['happy', 'milestones'],
    ]);
    assert.equal(h.eventLogs().filter(entry => entry.meta.result === 'error').length, 1);
});

test('skip reasons repeat at most once per server day', async () => {
    const h = harness({
        wish: wishState({ canDraw: false, canClaim: false }),
        happy: happyState({ canClaimDaily: false, canShare: false, canClaimMilestones: false }),
    });
    await h.automation.runAutumnAutomation(FLAGS);
    const first = h.skipLogs().length;
    await h.automation.runAutumnAutomation(FLAGS);
    assert.equal(h.skipLogs().length, first);
    h.advanceDay();
    await h.automation.runAutumnAutomation(FLAGS);
    assert.equal(h.skipLogs().length, first * 2);
});

test('closed activities are reported once and send nothing', async () => {
    const h = harness({
        wish: wishState({ active: false }),
        happy: happyState({ active: false }),
    });
    await h.automation.runAutumnAutomation(FLAGS);
    assert.deepEqual(h.operations, []);
    assert.deepEqual(h.skipLogs().map(entry => entry.meta.action), ['wish', 'happy']);
});
