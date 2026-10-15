"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountQingMeiActivityRoutes = mountQingMeiActivityRoutes;
function mountQingMeiActivityRoutes({ app, ctx, withAccount, mountGet }) {
    mountGet('/api/activity-center/qingmei', 'getCurrentQingMeiActivity');
    app.post('/api/activity-center/qingmei/daily-seed/claim', withAccount(accountId => ctx.provider.claimQingMeiDailySeed(accountId)));
    app.post('/api/activity-center/qingmei/brew/start', withAccount((accountId, req) => ctx.provider.startQingMeiBrew(accountId, req.body?.ingredients ?? req.body?.count)));
    app.post('/api/activity-center/qingmei/brew/continue', withAccount(accountId => ctx.provider.continueQingMeiBrew(accountId)));
    app.post('/api/activity-center/qingmei/brew/settle', withAccount(accountId => ctx.provider.settleQingMeiBrew(accountId)));
}
//# sourceMappingURL=qingmei-routes.js.map