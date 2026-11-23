"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * AdminContext factory
 * Creates and holds all shared state for the admin server.
 */
const { createPersistentTokenSet } = require('./session-tokens');
function createAdminContext(dataProvider) {
    const tokens = createPersistentTokenSet();
    return {
        tokens,
        app: null,
        server: null,
        io: null,
        provider: dataProvider,
    };
}
module.exports = { createAdminContext };
//# sourceMappingURL=context.js.map