const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createSolarCalendarAutomation,
    isSolarCalendarAutomationEnabled,
    SOLAR_CALENDAR_AUTOMATION_KEYS,
    SOLAR_CALENDAR_CHECK_INTERVAL_MS,
} = require('../dist/services/solar-calendar-auto');
const {
    ALLOWED_AUTOMATION_KEYS,
    DEFAULT_ACCOUNT_CONFIG,
    normalizeAccountConfig,
} = require('../dist/models/store/shared-state');

const DAY_MS = 24 * 3600;

function calendar(events = [], seasons = []) {
    return { serverTime: 1790260000, defaultEventId: events[0]?.id || 0, events, seasons };
}

function event(id, name, overrides = {}) {
    return { id, name, status: 2, canClaim: false, directClaimed: false, quizClaimed: false, rewards: [], ...overrides };
}

function season(id, name, overrides = {}) {
    return { id, name, litCount: 3, totalCount: 3, canClaim: false, claimed: false, rewards: [], ...overrides };
}

/**
 * 一次读得到日历，每笔领取回一份新的日历；operate 传 Error 可以模拟这一笔写失败。
 */
function harness({ state, operate, serverTime = 1790260000 } = {}) {
    const logs = [];
    const reads = [];
    const calls = [];
    let now = serverTime;
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
    const automation = createSolarCalendarAutomation({
        getSolarCalendar: () => track(async () => {
            reads.push('calendar');
            const value = typeof state === 'function' ? state() : state;
            if (value instanceof Error) throw value;
            return value ?? calendar();
        }),
        operateSolarCalendar: (action, input) => track(async () => {
            calls.push({ action, input: input || {} });
            if (operate) {
                const outcome = operate(action, input || {});
                if (outcome instanceof Error) throw outcome;
                return outcome;
            }
            return { rewards: [{ name: '果实', count: 2 }], calendar: state };
        }),
        getServerTimeSec: () => now,
        log: (module, message, meta) => logs.push({ module, message, meta }),
    });
    return {
        automation,
        logs,
        reads,
        calls,
        maxInflight: () => maxInflight,
        skipLogs: () => logs.filter(entry => entry.meta?.result === 'skip'),
        errorLogs: () => logs.filter(entry => entry.meta?.result === 'error'),
        advanceDay: (days = 1) => { now += days * DAY_MS; },
    };
}

const BOTH = { claimEvents: true, claimSeasons: true };
const NO_FLAGS = { claimEvents: false, claimSeasons: false };

test('节令日历的两个开关默认是开的，且能穿过配置白名单', () => {
    assert.deepEqual([...SOLAR_CALENDAR_AUTOMATION_KEYS], ['solar_calendar_claim_events', 'solar_calendar_claim_seasons']);
    for (const key of SOLAR_CALENDAR_AUTOMATION_KEYS) {
        assert.equal(ALLOWED_AUTOMATION_KEYS.has(key), true, `${key} 应在白名单里`);
        assert.equal(DEFAULT_ACCOUNT_CONFIG.automation[key], true, `${key} 默认开`);
    }

    // 主动关掉过的账号不会被翻回来；非布尔值按 !! 归一。
    const saved = normalizeAccountConfig({
        automation: { solar_calendar_claim_events: false, solar_calendar_claim_seasons: 'yes' },
    }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation;
    assert.equal(saved.solar_calendar_claim_events, false);
    assert.equal(saved.solar_calendar_claim_seasons, true);
    // 配置里从没出现过的节令 key 继承默认（开）。
    assert.equal(normalizeAccountConfig({ automation: {} }, { automation: DEFAULT_ACCOUNT_CONFIG.automation }).automation.solar_calendar_claim_events, true);
});

test('开关全关时不读日历，也不发任何写请求', async () => {
    const h = harness({ state: calendar([event(401, '重阳', { canClaim: true })]) });
    await h.automation.runSolarCalendarAutomation(NO_FLAGS);
    assert.equal(h.reads.length, 0);
    assert.equal(h.calls.length, 0);
    assert.equal(isSolarCalendarAutomationEnabled({ solar_calendar_claim_events: true }), true);
    assert.equal(isSolarCalendarAutomationEnabled({ solar_calendar_claim_seasons: false }), false);
});

test('只领服务端说可以领的节令直达奖励，答错题目的操作一次都不发', async () => {
    const open = calendar([
        event(401, '重阳', { canClaim: true }),
        event(402, '霜降', { canClaim: false, directClaimed: true }),
        { ...event(304, '寒露'), status: 3 },
    ], [season(3, '秋季', { canClaim: true })]);
    const h = harness({
        state: open,
        operate: (action) => ({ rewards: [{ name: '果实', count: 5 }], calendar: action === 'season' ? calendar([], []) : calendar([event(401, '重阳', { canClaim: false, directClaimed: true }), event(402, '霜降', { directClaimed: true })]) }),
    });
    await h.automation.runSolarCalendarAutomation(BOTH);

    assert.deepEqual(h.calls.map(v => v.action), ['claim', 'season']);
    assert.deepEqual(h.calls.map(v => v.input.id), [401, 3]);
    assert.equal(h.calls.some(v => v.action === 'answer'), false, '答题不在自动化范围内');
    assert.ok(h.logs.some(v => v.message.includes('领节令直达奖励（重阳）完成') && v.message.includes('果实x5')));
    assert.ok(h.logs.some(v => v.message.includes('领季度奖励（秋季）完成')));
});

test('上一笔领取的回包说这项已经领过，就不会再发第二笔', async () => {
    // 第一轮读回来两个可领，但第一笔写入的回包里第二个已经变成不可领（同一季里连着达标）。
    let reads = 0;
    const first = calendar([event(401, '重阳', { canClaim: true }), event(402, '霜降', { canClaim: true })]);
    const afterClaim = calendar([event(401, '重阳', { directClaimed: true }), event(402, '霜降', { canClaim: false, directClaimed: true })]);
    const h = harness({
        state: () => (reads++ === 0 ? first : afterClaim),
        operate: () => ({ rewards: [], calendar: afterClaim }),
    });
    await h.automation.runSolarCalendarAutomation({ claimEvents: true, claimSeasons: false });
    assert.deepEqual(h.calls.map(v => v.input.id), [401]);
    assert.equal(h.reads.length, 1, '领完用回包里的日历接着判断，不额外重读');
});

test('没有可领的东西只记一行按天去重的跳过，不发写请求', async () => {
    const h = harness({ state: calendar([event(401, '重阳', { directClaimed: true })], [season(3, '秋季', { claimed: true })]) });
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.skipLogs().map(v => v.meta.action), ['claim_events', 'claim_seasons']);

    // 同一分钟级别内再来一轮：不该重复记同样的跳过。
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.equal(h.skipLogs().length, 2);

    // 跨过服务端日期后，同一个理由可以再记一次。
    h.advanceDay(1);
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.equal(h.skipLogs().length, 4);
});

test('领取成功但日历刷新失败时，本轮剩下的留给下一轮', async () => {
    const open = calendar([event(401, '重阳', { canClaim: true }), event(402, '霜降', { canClaim: true })]);
    const h = harness({ state: open, operate: () => ({ rewards: [{ name: '果实', count: 1 }], calendar: null, refreshRequired: true }) });
    await h.automation.runSolarCalendarAutomation({ claimEvents: true, claimSeasons: false });
    assert.equal(h.calls.length, 1, '刷不出新状态就不该继续基于旧清单领');
    assert.ok(h.skipLogs().some(v => v.message.includes('刷新失败')));
});

test('一项写失败不带走另一项，也绝不自己重试', async () => {
    const open = calendar([event(401, '重阳', { canClaim: true }), event(402, '霜降', { canClaim: true })], [season(3, '秋季', { canClaim: true })]);
    const h = harness({ state: open, operate: (action, input) => (action === 'claim' && input.id === 401 ? new Error('节令尚未开放、已结束或今日操作已完成') : { rewards: [], calendar: open }) });
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.deepEqual(h.calls.map(v => `${v.action}:${v.input.id}`), ['claim:401', 'claim:402', 'season:3']);
    assert.equal(h.errorLogs().length, 1);
    assert.ok(h.errorLogs()[0].message.includes('领节令直达奖励（重阳）失败'));
});

test('读取日历失败只记错误，不影响同一步之后的另一个开关', async () => {
    let reads = 0;
    const good = calendar([], [season(3, '秋季', { canClaim: true })]);
    const h = harness({
        state: () => (++reads === 1 ? new Error('节令日历回包不完整') : good),
        operate: () => ({ rewards: [], calendar: good }),
    });
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.equal(h.errorLogs().length, 1);
    assert.ok(h.errorLogs()[0].message.includes('节令日历自动任务读取状态失败'));
    assert.deepEqual(h.calls.map(v => v.action), ['season']);
});

test('两个步骤和步骤内的连续领取都是排队跑的，最多只有一个请求在飞', async () => {
    const open = calendar(
        [event(401, '重阳', { canClaim: true }), event(402, '霜降', { canClaim: true })],
        [season(3, '秋季', { canClaim: true }), season(4, '冬季', { canClaim: true })],
    );
    const h = harness({ state: open, operate: () => ({ rewards: [], calendar: open }) });
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.equal(h.maxInflight(), 1);
    assert.deepEqual(h.calls.map(v => `${v.action}:${v.input.id}`), ['claim:401', 'claim:402', 'season:3', 'season:4']);
});

test('一轮最多领 5 个节令、3 个季度，剩下的留到下一轮', async () => {
    const many = calendar(
        [1, 2, 3, 4, 5, 6, 7].map(id => event(id, `节令${id}`, { canClaim: true })),
        [1, 2, 3, 4].map(id => season(id, `季度${id}`, { canClaim: true })),
    );
    const h = harness({ state: many, operate: () => ({ rewards: [], calendar: many }) });
    await h.automation.runSolarCalendarAutomation(BOTH);
    assert.equal(h.calls.filter(v => v.action === 'claim').length, 5);
    assert.equal(h.calls.filter(v => v.action === 'season').length, 3);
});

test('检查间隔是半小时，和奶茶一致', () => {
    assert.equal(SOLAR_CALENDAR_CHECK_INTERVAL_MS, 30 * 60 * 1000);
});
