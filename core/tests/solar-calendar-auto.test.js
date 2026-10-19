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
 * 带题目的节令：question/options/answerIndex 是上游 2026-10-19 起才给的官方标注，
 * canAnswer、wrongOptions 由服务端判定，答题写请求要把题目原文 expectedQuestion 一起带回去做比对。
 */
function quizEvent(id, name, overrides = {}) {
    return event(id, name, {
        question: '重阳节又被称为什么节？',
        options: ['A.敬老节', 'B.儿童节', 'C.母亲节', 'D.教师节'],
        answerIndex: 0,
        canAnswer: true,
        wrongOptions: [],
        ...overrides,
    });
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

const BOTH = { claimEvents: true, claimSeasons: true, answerQuiz: false };
const QUIZ = { claimEvents: false, claimSeasons: false, answerQuiz: true };
const NO_FLAGS = { claimEvents: false, claimSeasons: false, answerQuiz: false };

test('节令日历的三个开关默认是开的，且能穿过配置白名单', () => {
    assert.deepEqual([...SOLAR_CALENDAR_AUTOMATION_KEYS], ['solar_calendar_claim_events', 'solar_calendar_claim_seasons', 'solar_calendar_answer_quiz']);
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
    // 答题开关单独开着也要把定时任务拉起来（跳过说明得记到日志里）。
    assert.equal(isSolarCalendarAutomationEnabled({ solar_calendar_answer_quiz: true }), true);
});

test('只领服务端说可以领的节令直达奖励，答题开关关着时一次答题都不发', async () => {
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
    assert.equal(h.calls.some(v => v.action === 'answer'), false, '答题开关关着时不该发 answer');
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

test('答题只在官方标注过答案的节令上提交，题目原文要一起带回去', async () => {
    const open = calendar([quizEvent(401, '重阳')]);
    const h = harness({
        state: open,
        operate: () => ({ rewards: [{ name: '节令礼盒', count: 1 }], correct: true, calendar: calendar([quizEvent(401, '重阳', { canAnswer: false, quizClaimed: true })]) }),
    });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.deepEqual(h.calls, [{ action: 'answer', input: { id: 401, optionIndex: 0, expectedQuestion: '重阳节又被称为什么节？' } }]);
    assert.ok(h.logs.some(v => v.message.includes('节令答题（重阳·选「A.敬老节」）完成') && v.message.includes('节令礼盒x1')));
});

test('官方没标注答案的节令只记一行跳过，一个写请求都不发', async () => {
    const open = calendar([quizEvent(401, '重阳', { answerIndex: null }), quizEvent(402, '霜降', { answerIndex: null })]);
    const h = harness({ state: open });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 0, '没有标注就等于没有可自动化的固定选法，猜答案不在范围内');
    assert.equal(h.skipLogs().length, 1);
    assert.equal(h.skipLogs()[0].meta.action, 'answer_quiz');
    assert.ok(h.skipLogs()[0].message.includes('重阳、霜降 的官方配置还没标注正确答案'));
});

test('有标注但今天不该答（已答对领过、今天已答错）时不发写请求', async () => {
    const open = calendar([
        quizEvent(401, '重阳', { canAnswer: false, quizClaimed: true }),
        quizEvent(402, '霜降', { canAnswer: false, quizWrongToday: true }),
    ]);
    const h = harness({ state: open });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 0);
    assert.ok(h.skipLogs().some(v => v.meta.action === 'answer_quiz' && v.message.includes('重阳、霜降 今天不该答')));
});

test('标注的答案出现在服务端的错项记录里时，当标注不可信、跳过不答', async () => {
    const open = calendar([quizEvent(401, '重阳', { wrongOptions: [0] })]);
    const h = harness({ state: open });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 0);
    assert.ok(h.skipLogs().some(v => v.message.includes('标注不可信')));
});

test('服务端把标注的答案判错了就记一条错误，不重试也不换答案', async () => {
    const open = calendar([quizEvent(401, '重阳')]);
    const h = harness({
        state: open,
        operate: () => ({ rewards: [], correct: false, calendar: calendar([quizEvent(401, '重阳', { canAnswer: false, quizWrongToday: true, wrongOptions: [0] })]) }),
    });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 1);
    assert.equal(h.errorLogs().length, 1);
    assert.ok(h.errorLogs()[0].message.includes('官方标注与服务端判定不一致'));
});

test('答题排在季度领取之前，三步一起排队跑、最多一个请求在飞', async () => {
    const open = calendar([quizEvent(401, '重阳', { canClaim: true })], [season(3, '秋季', { canClaim: true })]);
    const h = harness({ state: open, operate: () => ({ rewards: [], correct: true, calendar: open }) });
    await h.automation.runSolarCalendarAutomation({ claimEvents: true, claimSeasons: true, answerQuiz: true });
    assert.deepEqual(h.calls.map(v => v.action), ['claim', 'answer', 'season']);
    assert.equal(h.maxInflight(), 1);
});

test('一轮最多答 3 题，剩下的留到下一轮', async () => {
    const many = calendar([1, 2, 3, 4, 5].map(id => quizEvent(id, `节令${id}`)));
    const h = harness({ state: many, operate: () => ({ rewards: [], correct: true, calendar: many }) });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 3);
    assert.deepEqual(h.calls.map(v => v.input.id), [1, 2, 3]);
});

test('答题成功但日历刷新失败时，本轮剩下的题留到下一轮', async () => {
    const open = calendar([quizEvent(401, '重阳'), quizEvent(402, '霜降')]);
    const h = harness({ state: open, operate: () => ({ rewards: [], correct: true, calendar: null, refreshRequired: true }) });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 1, '刷不出新状态就不该继续基于旧清单答');
    assert.ok(h.skipLogs().some(v => v.meta.action === 'answer_quiz' && v.message.includes('剩余答题留到下一轮')));
});

test('答题写请求失败只记这一条错误，绝不自己重试', async () => {
    const open = calendar([quizEvent(401, '重阳')]);
    const h = harness({ state: open, operate: () => new Error('题目已变化，请刷新后重新选择') });
    await h.automation.runSolarCalendarAutomation(QUIZ);
    assert.equal(h.calls.length, 1);
    assert.equal(h.errorLogs().length, 1);
    assert.ok(h.errorLogs()[0].message.includes('节令答题（重阳·选「A.敬老节」）失败'));
});

test('检查间隔是半小时，和奶茶一致', () => {
    assert.equal(SOLAR_CALENDAR_CHECK_INTERVAL_MS, 30 * 60 * 1000);
});
