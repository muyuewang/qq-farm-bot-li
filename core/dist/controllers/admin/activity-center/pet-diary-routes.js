"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountPetDiaryRoutes = mountPetDiaryRoutes;
function mountPetDiaryRoutes({ app, ctx, withAccount, mountGet }) {
    mountGet('/api/activity-center/pet-diary', 'getPetDiary');
    app.get('/api/activity-center/pet-diary/records', withAccount((id, req) => ctx.provider.getPetDiaryRecords(id, req.query.kind)));
    app.get('/api/activity-center/pet-diary/friend', withAccount((id, req) => ctx.provider.getPetDiaryFriend(id, req.query.gid)));
    app.post('/api/activity-center/pet-diary/operate', withAccount((id, req) => ctx.provider.operatePetDiary(id, req.body?.action, req.body?.params)));
}
//# sourceMappingURL=pet-diary-routes.js.map