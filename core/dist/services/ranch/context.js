"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
function runWithSendContext(value, run) {
    return context.run(value, run);
}
function getAmbientSendContext() { return context.getStore(); }
module.exports = { runWithSendContext, getAmbientSendContext };
//# sourceMappingURL=context.js.map