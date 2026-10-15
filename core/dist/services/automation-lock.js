"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
let tail = Promise.resolve();
let running = false;
function runExclusiveAutomationTask(taskName, taskFn) {
    const store = storage.getStore();
    if (store && store.exclusive)
        return Promise.resolve(taskFn());
    const run = tail.then(async () => {
        running = true;
        try {
            return await storage.run({ exclusive: true }, taskFn);
        }
        finally {
            running = false;
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