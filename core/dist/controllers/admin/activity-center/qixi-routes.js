"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountQixiActivityRoutes = mountQixiActivityRoutes;
function mountQixiActivityRoutes({ app, ctx, withAccount, mountGet }) {
    mountGet('/api/activity-center/qixi', 'getCurrentQixiActivity');
    app.post('/api/activity-center/qixi/bridge/claim', withAccount(accountId => ctx.provider.claimQixiBridgeRewards(accountId)));
    app.post('/api/activity-center/qixi/gift', withAccount((accountId, req) => ctx.provider.giftQixiSachet(accountId, req.body?.friendGid, req.body?.messageTextId ?? 15)));
}
//# sourceMappingURL=qixi-routes.js.map