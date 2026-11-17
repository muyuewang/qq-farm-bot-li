const assert = require('node:assert/strict');
const test = require('node:test');
const {
    createMugeAutomation,
    isMugeAutomationEnabled,
    startMugeTimer,
    MUGE_AUTOMATION_KEYS,
    MUGE_CHECK_INTERVAL_MS,
    MUGE_CHECK_PHASE_MS,
    MUGE_INITIAL_DELAY_MS,
} = require('../dist/services/muge-auto');
const {
    ALLOWED_AUTOMATION_KEYS,
    DEFAULT_ACCOUNT_CONFIG,
    normalizeAccountConfig,
} = require('../dist/models/store/shared-state');
const { questions } = require('../dist/activity-data/muge-20261117.json');

const DAY_MS = 24 * 3600;
const BOTH_ON = { claimRewards: true, finishSurvey: true };

function tier(id, status) {
    return { id: String(id), threshold: id * 10, status, rewards: [] };
}

function task(id, status) {
    return { id: String(id), description: `任务${id}`, progress: 1, target: 1, status, unlockDay: 1, points: 10, rewards: [] };
}

/** 全部作答：每题取第一个官方选项，与上游 settle 的前置校验同口径。 */
function allAnswers() {
    return Object.fromEntries(questions.map(q => [String(q.id), q.options[0].value]));
}

function mugeState(overrides = {}) {
    return {
        activityId: '2026111700',
        title: '牧歌初启',
        active: true,
        serverTime: 1794900000000,
        startTime: 1794800000000,
        endTime: 1795400000000,
        celebration: { total: 100, tiers: [tier(1, 1)] },
        friends: { count: 0, tiers: [tier(1, 1)] },
        handbook: { points: 0, tiers: [tier(1, 1)], tasks: [task(1, 1)] },
        personality: { answers: {}, personalityId: 0, settleCount: 0, shareRewardClaimed: false, image: '' },
        questions,
        ...overrides,
    };
}

/** 领取成功后服务端把该类可领项改成已领取（status 3）。 */
function claimed(state, action) {
    const next = JSON.parse(JSON.stringify(state));
    const mark = list => list.forEach(entry => { if (entry.status === 2) entry.status = 3; });
    if (action === 'claimCelebration') mark(next.celebration.tiers);
    if (action === 'claimFriends') mark(next.friends.tiers);
    if (action === 'claimTask') {
        mark(next.handbook.tasks);
        next.handbook.points += 10;
    }
    if (action === 'claimHandbook') mark(next.handbook.tiers);
    if (action === 'settle') {
        next.personality.personalityId = 3;
        next.personality.settleCount += 1;
    }
    if (action === 'claimShare') next.personality.shareRewardClaimed = true;
    return next;
}

/**
 * 一轮只该读一次活动状态；每笔写回一份新快照。operate 传 Error 模拟这一笔写失败，
 * 传对象则原样作为回包（用来模拟刷新失败或自定义的状态跃迁）。
 */
function harness({ state, operate, serverTime = 1794900000 } = {}) {
    const logs = [];
    const reads = [];
    const calls = [];
    let now = serverTime;
    let inflight = 0;
    let maxInflight = 0;
    let current = typeof state === 'function' ? state() : (state ?? mugeState());
    const track = async run => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        try {
            return await run();
        }
        finally {
            inflight--;
        }
    };
    const automation = createMugeAutomation({
        getMugeActivity: () => track(async () => {
            reads.push('list');
            const value = typeof state === 'function' ? state() : current;
            if (value instanceof Error) throw value;
            return value ?? mugeState();
        }),
        operateMugeActivity: action => track(async () => {
            calls.push(action);
            if (operate) {
                const outcome = operate(action, current);
                if (outcome instanceof Error) throw outcome;
                if (outcome && typeof outcome === 'object' && 'activity' in outcome) {
                    if (outcome.activity) current = outcome.activity;
                    return outcome;
                }
            }
            current = claimed(current, action);
            return { activity: current, rewards: [{ id: 1001, count: 5, name: '金币' }] };
        }),
        getServerTimeSec: () => now,
        log: (module, message, meta) => logs.push({ module, message, ...(meta || {}) }),
    });
    return {
        automation,
        logs,
        reads,
        calls,
        maxInflight: () => maxInflight,
        advance: ms => { now += ms; },
        snapshot: () => current,
    };
}

const result = log => log.result;

test('牧歌两个开关默认开，且落在自动化键白名单里', () => {
    assert.deepEqual([...MUGE_AUTOMATION_KEYS], ['muge_claim_rewards', 'muge_finish_survey']);
    assert.equal(DEFAULT_ACCOUNT_CONFIG.automation.muge_claim_rewards, true);
    assert.equal(DEFAULT_ACCOUNT_CONFIG.automation.muge_finish_survey, true);
    for (const key of MUGE_AUTOMATION_KEYS) assert.ok(ALLOWED_AUTOMATION_KEYS.has(key), `${key} 应在白名单里`);
    assert.equal(isMugeAutomationEnabled({}), false);
    assert.equal(isMugeAutomationEnabled({ muge_claim_rewards: true }), true);
    assert.equal(isMugeAutomationEnabled({ muge_finish_survey: true }), true);
    // 保存时 false 必须留住，不能被默认值顶回 true。
    const saved = normalizeAccountConfig({ automation: { muge_claim_rewards: false, muge_finish_survey: false } });
    assert.equal(saved.automation.muge_claim_rewards, false);
    assert.equal(saved.automation.muge_finish_survey, false);
});

test('牧歌复查节奏半小时，错相位与首跑都避开节令与神秘商人', () => {
    assert.equal(MUGE_CHECK_INTERVAL_MS, 30 * 60 * 1000);
    assert.ok(MUGE_CHECK_PHASE_MS > 0 && MUGE_CHECK_PHASE_MS < MUGE_CHECK_INTERVAL_MS);
    // 节令 19min、神秘商人 37min：三个周期任务不能同秒到期一起抢锁。
    assert.notEqual(MUGE_CHECK_PHASE_MS, 19 * 60 * 1000);
    assert.notEqual(MUGE_CHECK_PHASE_MS, 37 * 60 * 1000);
    // 节令首跑 150s，登录后第一波活动读取要错开。
    assert.notEqual(MUGE_INITIAL_DELAY_MS, 150000);
    assert.ok(MUGE_INITIAL_DELAY_MS > 0);
});

test('牧歌不在开放窗口或活动组缺失时不发写请求，只按天记一行跳过', async () => {
    const inactive = harness({ state: mugeState({ active: false }) });
    await inactive.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(inactive.calls, []);
    assert.equal(inactive.reads.length, 1);
    assert.ok(inactive.logs.some(log => result(log) === 'skip' && log.action === 'read'));

    const err = Object.assign(new Error('牧歌初启活动数据暂不可用'), { code: 'MUGE_UNAVAILABLE' });
    const missing = harness({ state: () => err });
    await missing.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(missing.calls, []);
    // 活动组没下发是正常状态，记跳过而不是错误。
    assert.ok(missing.logs.every(log => result(log) !== 'error'));
    assert.ok(missing.logs.some(log => result(log) === 'skip' && log.action === 'read'));
});

test('牧歌没什么可领时一轮只读一次、零写请求，跳过日志按服务端日期去重', async () => {
    const h = harness();
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, []);
    assert.equal(h.reads.length, 1);
    const skips = h.logs.filter(log => result(log) === 'skip');
    assert.ok(skips.length >= 5, '四类领取与人格收尾各留一行跳过说明');
    assert.equal(h.maxInflight(), 1);

    const before = h.logs.length;
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.equal(h.logs.length, before, '同一天第二轮不该再刷跳过日志');
    h.advance(DAY_MS);
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.ok(h.logs.length > before, '跨天要重新记一行');
});

test('牧歌四类奖励都可领时按顺序各写一次，手册任务排在积分档位之前', async () => {
    const h = harness({
        state: mugeState({
            celebration: { total: 100, tiers: [tier(1, 2), tier(2, 3)] },
            friends: { count: 3, tiers: [tier(1, 2)] },
            handbook: { points: 30, tiers: [tier(1, 2)], tasks: [task(1, 2), task(2, 3)] },
        }),
    });
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, ['claimCelebration', 'claimFriends', 'claimTask', 'claimHandbook']);
    assert.equal(h.reads.length, 1, '后续判断用写回包的快照，不再重复读');
    assert.equal(h.maxInflight(), 1, '串行，不并发');
    assert.equal(h.logs.filter(log => result(log) === 'success').length, 4);
});

test('牧歌手册任务领完积分才达标时，同一轮接着领积分档位', async () => {
    const h = harness({
        state: mugeState({
            handbook: { points: 0, tiers: [tier(1, 1)], tasks: [task(1, 2)] },
        }),
        operate: (action, current) => {
            if (action !== 'claimTask') return undefined;
            const next = claimed(current, action);
            // 任务奖励带积分，服务端在回包里把积分档位点亮。
            next.handbook.tiers = [tier(1, 2)];
            return { activity: next, rewards: [] };
        },
    });
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, ['claimTask', 'claimHandbook']);
});

test('牧歌某一笔写未确认就中止本轮，绝不重试也不接着写', async () => {
    const unknown = Object.assign(new Error('操作回包未能确认，请刷新核对，勿重复提交'), { code: 'MUGE_RESULT_UNKNOWN' });
    const h = harness({
        state: mugeState({
            celebration: { total: 100, tiers: [tier(1, 2)] },
            friends: { count: 3, tiers: [tier(1, 2)] },
            handbook: { points: 30, tiers: [tier(1, 2)], tasks: [task(1, 2)] },
        }),
        operate: action => (action === 'claimFriends' ? unknown : undefined),
    });
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, ['claimCelebration', 'claimFriends']);
    assert.equal(h.calls.filter(action => action === 'claimFriends').length, 1, '未确认的写入不重试');
    assert.ok(h.logs.some(log => result(log) === 'error' && log.action === 'claimFriends'));
});

test('牧歌写成功但刷新失败时本轮收尾，剩下的留到下一轮', async () => {
    const h = harness({
        state: mugeState({
            celebration: { total: 100, tiers: [tier(1, 2)] },
            friends: { count: 3, tiers: [tier(1, 2)] },
        }),
        operate: action => (action === 'claimCelebration'
            ? { activity: null, rewards: [], refreshRequired: true }
            : undefined),
    });
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, ['claimCelebration']);
    assert.ok(h.logs.some(log => result(log) === 'skip' && /刷新失败/.test(log.message)));
});

test('牧歌人格测试没答完时不结算也不领分享，答案留给用户自己选', async () => {
    const partial = allAnswers();
    delete partial[String(questions[questions.length - 1].id)];
    const h = harness({
        state: mugeState({ personality: { answers: partial, personalityId: 0, settleCount: 0, shareRewardClaimed: false } }),
    });
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, []);
    assert.ok(h.logs.some(log => result(log) === 'skip' && log.action === 'finish_survey' && /还没答完/.test(log.message)));

    // 答案落在官方选项之外同样不算答完。
    const invalid = harness({
        state: mugeState({ personality: { answers: { ...allAnswers(), [String(questions[0].id)]: 99 }, personalityId: 0, settleCount: 0, shareRewardClaimed: false } }),
    });
    await invalid.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(invalid.calls, []);
});

test('牧歌答完全部题却没结算时先结算再领一次性首次分享', async () => {
    const h = harness({
        state: mugeState({ personality: { answers: allAnswers(), personalityId: 0, settleCount: 0, shareRewardClaimed: false } }),
    });
    await h.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(h.calls, ['settle', 'claimShare']);
    assert.equal(h.maxInflight(), 1);
    assert.equal(h.snapshot().personality.personalityId, 3);
    assert.equal(h.snapshot().personality.shareRewardClaimed, true);
});

test('牧歌已结算只补领分享，已领过分享则零写请求', async () => {
    const settled = harness({
        state: mugeState({ personality: { answers: allAnswers(), personalityId: 3, settleCount: 1, shareRewardClaimed: false } }),
    });
    await settled.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(settled.calls, ['claimShare'], '已有人格结果就不该再结算');

    const done = harness({
        state: mugeState({ personality: { answers: allAnswers(), personalityId: 3, settleCount: 1, shareRewardClaimed: true } }),
    });
    await done.automation.runMugeAutomation(BOTH_ON);
    assert.deepEqual(done.calls, []);
    assert.ok(done.logs.some(log => result(log) === 'skip' && /已经领过/.test(log.message)));
});

test('牧歌关掉领取只跑人格收尾，关掉收尾只跑领取，全关则零写请求', async () => {
    const state = mugeState({
        celebration: { total: 100, tiers: [tier(1, 2)] },
        personality: { answers: allAnswers(), personalityId: 0, settleCount: 0, shareRewardClaimed: false },
    });
    const surveyOnly = harness({ state });
    await surveyOnly.automation.runMugeAutomation({ claimRewards: false, finishSurvey: true });
    assert.deepEqual(surveyOnly.calls, ['settle', 'claimShare']);

    const claimOnly = harness({ state });
    await claimOnly.automation.runMugeAutomation({ claimRewards: true, finishSurvey: false });
    assert.deepEqual(claimOnly.calls, ['claimCelebration']);

    const off = harness({ state });
    await off.automation.runMugeAutomation({ claimRewards: false, finishSurvey: false });
    assert.deepEqual(off.calls, []);
    assert.equal(off.reads.length, 1);
});

/**
 * 定时器接线：用桩 scheduler 记录注册动作，并把 store 换成桩，
 * 这样既不触发真实网络请求，也不碰运行态账号数据。只断言注册，不触发回调。
 */
function timerHarness(automation) {
    const storePath = require.resolve('../dist/models/store');
    require.cache[storePath] = {
        id: storePath,
        filename: storePath,
        loaded: true,
        exports: { getAutomation: () => automation },
    };
    const cleared = [];
    const timeouts = [];
    const intervals = [];
    return {
        cleared,
        timeouts,
        intervals,
        scheduler: {
            clear: key => cleared.push(key),
            setTimeoutTask: (key, ms, fn) => timeouts.push({ key, ms, fn }),
            setIntervalTask: (key, ms, fn, options) => intervals.push({ key, ms, fn, options }),
        },
    };
}

test('牧歌开关开着时注册首跑与半小时周期，错相位随 interval 一起传下去', () => {
    const h = timerHarness({ muge_claim_rewards: true, muge_finish_survey: true });
    startMugeTimer(h.scheduler, () => true);
    assert.deepEqual(h.cleared, ['muge_initial', 'muge_interval']);
    assert.equal(h.timeouts.length, 1);
    assert.equal(h.timeouts[0].key, 'muge_initial');
    assert.equal(h.timeouts[0].ms, MUGE_INITIAL_DELAY_MS);
    assert.equal(h.intervals.length, 1);
    assert.equal(h.intervals[0].key, 'muge_interval');
    assert.equal(h.intervals[0].ms, MUGE_CHECK_INTERVAL_MS);
    assert.equal(h.intervals[0].options.phaseMs, MUGE_CHECK_PHASE_MS);
});

test('牧歌重复挂表先清旧键不叠加，开关全关或未登录时只清不挂', () => {
    const on = timerHarness({ muge_claim_rewards: true });
    startMugeTimer(on.scheduler, () => true);
    startMugeTimer(on.scheduler, () => true);
    assert.equal(on.timeouts.length, 2, '每次挂表各注册一次');
    assert.deepEqual(on.cleared, ['muge_initial', 'muge_interval', 'muge_initial', 'muge_interval'], '第二次挂表前清掉第一次的键');

    const off = timerHarness({ muge_claim_rewards: false, muge_finish_survey: false });
    startMugeTimer(off.scheduler, () => true);
    assert.deepEqual(off.cleared, ['muge_initial', 'muge_interval']);
    assert.equal(off.timeouts.length, 0);
    assert.equal(off.intervals.length, 0);

    const notReady = timerHarness({ muge_claim_rewards: true });
    startMugeTimer(notReady.scheduler, () => false);
    assert.equal(notReady.timeouts.length, 0);
    assert.equal(notReady.intervals.length, 0);
});