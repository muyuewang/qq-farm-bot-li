const assert = require('node:assert/strict');
const test = require('node:test');

const { createPetDiaryAutomation } = require('../dist/services/pet-diary-auto');

// 时间用可控秒针，宝藏 endTime 一律相对 now 计算，避免真实时钟漂移。
function setup(options = {}) {
    let nowSec = 1700000000;
    const calls = [];
    const logs = [];
    const pet = {
        active: true,
        hunt: { canPlunder: true },
        battleCount: 0,
        battleLimit: 5,
        treasures: [],
        stories: [],
        solarTerms: { terms: [] },
        balances: options.balances ?? [{ id: '80101', name: '挑战书', count: '2', known: true }],
    };
    const automation = createPetDiaryAutomation({
        getPetDiary: async () => pet,
        operatePetDiary: async (action, params) => {
            calls.push({ action, params });
            const next = options.operate ? options.operate(calls.length, params) : {};
            return { action, message: next.message ?? '夺宝成功', snapshot: next.snapshot, rewards: [] };
        },
        getServerTimeSec: () => nowSec,
        log: (module, message, meta) => logs.push({ message, result: meta?.result }),
        getFriendsList: async () => options.friends ?? [],
        getFriend: async (gid) => {
            const entry = (options.friendData || {})[gid];
            if (entry instanceof Error) throw entry;
            return typeof entry === 'function' ? entry(nowSec) : entry;
        },
    });
    const advance = (sec) => { nowSec += sec; };
    const run = () => automation.runPetDiaryAutomation({
        adopt: false, feed: false, draw: false, story: false, seeds: false,
        solar: false, treasure: false, compensation: false, battle: true, charm: false,
    });
    return { run, calls, logs, pet, advance, now: () => nowSec };
}

const plunderableTreasure = (ctx, id = 'T1') => ({
    id, status: 2, endTime: (ctx.now() + 600) * 1000, item: { name: '青铜宝藏' },
    previews: [{ challengeId: '80101', canStart: true }],
});

test('好友有护送中的宝藏且自己有挑战书时，会按正确的挑战书发起夺宝', async () => {
    const ctx = setup({
        friends: [{ gid: '111' }],
        friendData: { 111: () => ({ gid: '111', treasures: [plunderableTreasure(ctx)], charms: [] }) },
    });
    await ctx.run();
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].action, 'battle');
    assert.deepEqual(ctx.calls[0].params, { gid: '111', treasureId: 'T1', challengeId: '80101' });
    assert.match(ctx.logs.map(l => l.message).join('\n'), /萌宠好友夺宝 \(好友 111/);
});

test('接错好友取数接口（农田那种没有 treasures 的返回）不再静默空转，会报响应异常', async () => {
    // 曾经的真实故障：worker 把 getFriend 接到 getFriendLandsDetail，返回 { lands, summary, career }，
    // 夺宝判定读不到 treasures / gid，整轮静默跳过，看起来就是「开关开了但不生效」。
    const ctx = setup({
        friends: [{ gid: '111' }],
        friendData: { 111: { lands: [], summary: {}, career: null } },
    });
    await ctx.run();
    assert.equal(ctx.calls.length, 0, '拿不到宝藏数据就不该发起夺宝');
    const text = ctx.logs.map(l => l.message).join('\n');
    assert.match(text, /1 位好友响应异常/, text);
});

test('没有挑战书时直接跳过，并且不去逐个读好友', async () => {
    const reads = [];
    const ctx = setup({
        balances: [{ id: '80101', count: '0', known: true }],
        friends: [{ gid: '111' }],
        friendData: { 111: (now) => { reads.push(now); return { gid: '111', treasures: [], charms: [] }; } },
    });
    await ctx.run();
    assert.deepEqual(reads, [], '没道具就别浪费好友查询的请求');
    assert.match(ctx.logs.map(l => l.message).join('\n'), /背包里没有挑战书/);
});

test('今日次数用完后即使还有好友也不再发起，换到的新快照要参与判定', async () => {
    let battles = 0;
    const ctx = setup({
        friends: [{ gid: '111' }, { gid: '222' }, { gid: '333' }],
        friendData: {
            111: () => ({ gid: '111', treasures: [plunderableTreasure(ctx, 'A')], charms: [] }),
            222: () => ({ gid: '222', treasures: [plunderableTreasure(ctx, 'B')], charms: [] }),
            333: () => ({ gid: '333', treasures: [plunderableTreasure(ctx, 'C')], charms: [] }),
        },
        operate: () => {
            battles++;
            // 每次夺宝后服务端快照：打到第 2 场就到达上限。
            const battleCount = battles;
            return {
                message: '夺宝成功',
                snapshot: {
                    active: true, treasures: [], stories: [], solarTerms: { terms: [] },
                    hunt: { canPlunder: battleCount < 2 },
                    battleCount, battleLimit: 2,
                    balances: [{ id: '80101', count: '9', known: true }],
                },
            };
        },
    });
    await ctx.run();
    assert.deepEqual(ctx.calls.map(c => c.params.gid), ['111', '222'], '次数见顶后不再碰第三位好友');
});

test('好友响应里的 gid 对不上时不发起夺宝，并计入响应异常', async () => {
    const ctx = setup({
        friends: [{ gid: '111' }],
        friendData: { 111: () => ({ gid: '999', treasures: [plunderableTreasure(ctx)], charms: [] }) },
    });
    await ctx.run();
    assert.equal(ctx.calls.length, 0);
    assert.match(ctx.logs.map(l => l.message).join('\n'), /1 位好友响应异常/);
});

test('读取好友失败会停下整轮并写明原因，不再无声退出', async () => {
    const ctx = setup({
        friends: [{ gid: '111' }, { gid: '222' }],
        friendData: { 111: new Error('请求超时: VisitFriendFarm') },
    });
    await ctx.run();
    assert.equal(ctx.calls.length, 0);
    assert.match(ctx.logs.map(l => l.message).join('\n'), /读取好友 111 失败，本轮停止: 请求超时/);
});
