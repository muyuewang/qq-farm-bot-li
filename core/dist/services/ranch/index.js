"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { getState } = require('./state');
const { prepareAction, operate } = require('./actions');
module.exports = { getRanchState: getState, prepareRanchAction: prepareAction, operateRanch: operate };
//# sourceMappingURL=index.js.map