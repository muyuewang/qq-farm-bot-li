const assert = require('node:assert/strict');
const test = require('node:test');
const EventEmitter = require('node:events');

const { createWorkerManager } = require('../dist/runtime/worker-manager');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 只注入 manager 需要的依赖，用假子进程驱动 message/exit，
 * 这样「掉线 → 原 Code 重启」的节拍可以在毫秒级验证，不用真起进程。
 */
function setup(options = {}) {
    const workers = {};
    const children = [];
    const reminders = [];
    const accountLogs = [];
    const lines = [];

    function makeChild(label) {
        const child = new EventEmitter();
        child.sent = [];
        child.kills = 0;
        child.exitCode = null;
        child.signalCode = null;
        child.label = label;
        child.send = (msg) => child.sent.push(msg);
        child.kill = () => {
            child.kills += 1;
            child.exitCode = 0;
            child.emit('exit', 0, null);
            return true;
        };
        return child;
    }

    const manager = createWorkerManager({
        fork: (script, args, forkOptions) => {
            const child = makeChild(children.length);
            child.startMessage = forkOptions.env.FARM_ACCOUNT_ID;
            children.push(child);
            return child;
        },
        WorkerThread: function FakeThread() {},
        runtimeMode: 'fork',
        processRef: { env: {}, execPath: process.execPath },
        mainEntryPath: 'main.js',
        workerScriptPath: 'dist/core/worker.js',
        workers,
        globalLogs: [],
        log: (tag, message) => lines.push(message),
        addAccountLog: (action, message, accountId) => accountLogs.push({ action, message, accountId }),
        normalizeStatusForPanel: (data) => data || {},
        buildConfigSnapshotForAccount: () => ({
            systemTimeZone: 'Asia/Shanghai',
            systemServerUrl: 'wss://example',
            systemClientVersion: '1.14.1.10_20260916',
        }),
        getOfflineAutoDeleteMs: () => 3600000,
        triggerOfflineReminder: (payload) => reminders.push(payload),
        addOrUpdateAccount: () => ({}),
        deleteAccount: () => ({}),
        codeRetryDelayMs: options.codeRetryDelayMs ?? 20,
        codeRetryMinIntervalMs: options.codeRetryMinIntervalMs ?? 600000,
    });

    function lastConfigCode() {
        const child = children[children.length - 1];
        const start = child.sent.find((m) => m.type === 'start');
        return start ? start.config.code : '';
    }

    function disconnect(child, payload) {
        child.emit('message', { type: 'account_disconnected', reason: 'x', ...payload });
        child.emit('exit', 0, null);
    }

    return { manager, workers, children, reminders, accountLogs, lines, lastConfigCode, disconnect };
}

const ONLINE_DROP = { source: 'ws_close', code: 1006, phase: 'online' };

test('会话掉线后先用原 Code 重启一次，这一次不发下线提醒', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    assert.equal(ctx.children.length, 1);

    ctx.disconnect(ctx.children[0], ONLINE_DROP);
    assert.deepEqual(ctx.reminders, [], '试一次之前不该惊动人工');
    assert.ok(ctx.children[0].sent.some((m) => m.type === 'stop'), '旧进程要被停掉');
    assert.match(ctx.lines.join('\n'), /先用原 Code 重启试一次/);

    await sleep(60);
    assert.equal(ctx.children.length, 2, '延迟后应当重新拉起进程');
    assert.equal(ctx.lastConfigCode(), 'CODE-1', '重试用的是断开那一刻的原 Code');
});

test('原 Code 试过一次还是掉线：不再重试，按老路径发下线提醒', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[0], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 2);

    ctx.disconnect(ctx.children[1], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 2, '同一个 Code 在一个窗口内只试一次');
    assert.equal(ctx.reminders.length, 1);
    assert.equal(ctx.reminders[0].reason, 'disconnect:ws_close:online:1006');
    assert.match(ctx.lines.join('\n'), /等待 Helper 刷新 Code 或重新扫码/);
});

test('握手被拒（400 / phase=connecting）不重试：Code 本身已经无效', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[0], { source: 'ws_error', code: 400, phase: 'connecting' });
    await sleep(60);
    assert.equal(ctx.children.length, 1, '重发只会再吃一个 400');
    assert.equal(ctx.reminders.length, 1);
});

test('登录阶段就断（phase=connecting, code=0）同样不重试', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[0], { source: 'login_timeout', code: 0, phase: 'connecting' });
    await sleep(60);
    assert.equal(ctx.children.length, 1);
    assert.equal(ctx.reminders.length, 1);
});

test('手动停止会作废待执行的重试，不会把账号又拉起来', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[0], ONLINE_DROP);
    ctx.manager.stopWorker('A');
    await sleep(60);
    assert.equal(ctx.children.length, 1, '用户刚停掉的账号不能被自动重启');
});

test('换过 Code 之后重新获得一次重试机会', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[0], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 2);
    // 人工刷新了 Code：面板走 restartWorker，worker 上的 accountRef 换成新对象
    ctx.manager.restartWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-2', platform: 'qq' });
    ctx.children[1].kill();
    await sleep(20);
    assert.equal(ctx.children.length, 3);
    assert.equal(ctx.lastConfigCode(), 'CODE-2');

    ctx.disconnect(ctx.children[2], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 4, '新 Code 可以再试一次');
    assert.equal(ctx.lastConfigCode(), 'CODE-2');
    assert.deepEqual(ctx.reminders, []);
});

test('超过重试窗口后同一个 Code 还可以再试一次', async () => {
    const ctx = setup({ codeRetryMinIntervalMs: 400 });
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[0], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 2);

    // 窗口内：第二次掉线不再重试，交人工
    ctx.disconnect(ctx.children[1], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 2);
    assert.equal(ctx.reminders.length, 1);

    // 窗口过后（人工重新拉起）同一个 Code 又能试一次
    await sleep(400);
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.disconnect(ctx.children[2], ONLINE_DROP);
    await sleep(60);
    assert.equal(ctx.children.length, 4);
    assert.equal(ctx.reminders.length, 1, '重试成功在路上，不该再多发提醒');
});

test('被其他终端踢下线走 account_kicked，不参与原 Code 重试', async () => {
    const ctx = setup();
    ctx.manager.startWorker({ id: 'A', name: '沐月-QQ', code: 'CODE-1', platform: 'qq' });
    ctx.children[0].emit('message', { type: 'account_kicked', reason: '已在其他终端登录' });
    await sleep(60);
    assert.equal(ctx.children.length, 1, '和真人抢登录没有意义');
    assert.equal(ctx.reminders.length, 1);
    assert.match(ctx.reminders[0].reason, /^kickout:/);
});
