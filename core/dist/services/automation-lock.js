"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
let tail = Promise.resolve();
let running = false;
let lastTaskEndedAt = 0;
/** 两个任务之间至少留这么久的缝（串行本身不隔空，同秒到期的任务会首尾相接连着发）。 */
const MIN_TASK_GAP_MS = 1500;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function runExclusiveAutomationTask(taskName, taskFn) {
    const store = storage.getStore();
    if (store && store.exclusive)
        return Promise.resolve(taskFn());
    const run = tail.then(async () => {
        const gapMs = lastTaskEndedAt + MIN_TASK_GAP_MS - Date.now();
        if (gapMs > 0)
            await sleep(gapMs);
        running = true;
        try {
            return await storage.run({ exclusive: true }, taskFn);
        }
        finally {
            running = false;
            lastTaskEndedAt = Date.now();
        }
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
}
function isAutomationTaskRunning() {
    return running;
}
module.exports = {
    runExclusiveAutomationTask,
    isAutomationTaskRunning,
};
//# sourceMappingURL=automation-lock.js.map