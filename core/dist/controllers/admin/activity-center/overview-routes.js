"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountActivityOverviewRoutes = mountActivityOverviewRoutes;
function mountActivityOverviewRoutes({ mountGet }) {
    mountGet('/api/activity-center/activities', 'getActivityDirectorySnapshot');
    mountGet('/api/activity-center/snapshot', 'getActivityCenterSnapshot');
}
//# sourceMappingURL=overview-routes.js.map