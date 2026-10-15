"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountCharityActivityRoutes = mountCharityActivityRoutes;
function mountCharityActivityRoutes({ app, ctx, withAccount, mountGet }) {
    mountGet('/api/activity-center/charity-red-flower', 'getCurrentCharityRedFlowerActivity');
    app.post('/api/activity-center/charity-red-flower/seeds/claim', withAccount(accountId => ctx.provider.claimCharityRedFlowerSeeds(accountId)));
    app.post('/api/activity-center/charity-red-flower/love/donate', withAccount(accountId => ctx.provider.donateCharityRedFlowerLove(accountId)));
    app.post('/api/activity-center/charity-red-flower/daily-gift/claim', withAccount(accountId => ctx.provider.claimCharityRedFlowerDailyGift(accountId)));
    app.post('/api/activity-center/charity-red-flower/progress/claim', withAccount((accountId, req) => ctx.provider.claimCharityRedFlowerProgressReward(accountId, req.body?.target)));
}
//# sourceMappingURL=charity-routes.js.map