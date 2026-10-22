const assert = require('node:assert/strict');
const test = require('node:test');

const { createScheduler } = require('../dist/services/scheduler');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('phaseMs 把整条节拍往后挪，周期本身不变', async () => {
    const sched = createScheduler('phase_shift_ns');
    const runs = [];
    sched.setIntervalTask('phased', 40, () => { runs.push(Date.now()); }, { phaseMs: 150 });

    await sleep(100);
    assert.equal(runs.length, 0, '相位期内一次都不该跑');

    await sleep(220);
    assert.ok(runs.length >= 2, `相位结束后应恢复到 40ms 节拍，实际跑了 ${runs.length} 次`);
    assert.ok(runs[runs.length - 1] - runs[0] >= 40, '相邻两次 tick 的间隔就是原周期');
    sched.clearAll();
});

test('相位期内 clear 掉任务，节拍不会再起来', async () => {
    const sched = createScheduler('phase_clear_ns');
    let runs = 0;
    sched.setIntervalTask('dropped', 20, () => { runs += 1; }, { phaseMs: 60 });
    sched.clear('dropped');

    await sleep(200);
    assert.equal(runs, 0);
    assert.equal(sched.has('dropped'), false);
});

test('不传 phaseMs 时首 tick 仍在一个周期后就到（老行为不变）', async () => {
    const sched = createScheduler('phase_default_ns');
    let runs = 0;
    sched.setIntervalTask('plain', 40, () => { runs += 1; });
    await sleep(110);
    assert.ok(runs >= 1, `未设相位的任务应照常起节拍，实际 ${runs} 次`);
    sched.clearAll();
});
