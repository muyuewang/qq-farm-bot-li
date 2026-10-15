"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActivityRouteContext = createActivityRouteContext;
const error_handler_1 = require("./error-handler");
const { getAccId } = require('../middleware');
function createActivityRouteContext(app, ctx) {
    const withAccount = (handler) => async (req, res) => {
        const accountId = getAccId(ctx, req);
        if (!accountId)
            return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
        try {
            const data = await handler(accountId, req, res);
            if (!res.headersSent)
                return res.json({ ok: true, data });
            return undefined;
        }
        catch (error) {
            return (0, error_handler_1.handleActivityApiError)(res, error);
        }
    };
    const mountGet = (path, providerMethod) => {
        app.get(path, withAccount((accountId) => ctx.provider[providerMethod](accountId)));
    };
    return { app, ctx, withAccount, mountGet };
}
//# sourceMappingURL=context.js.map