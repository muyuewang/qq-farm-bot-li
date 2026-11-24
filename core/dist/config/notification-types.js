"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeNotificationTypes = normalizeNotificationTypes;
// 旧配置只在账号内选择商人提醒，全局默认放行以保留原有选择。
function normalizeNotificationTypes(input) {
    return {
        offline: input?.offline !== false,
        mysteryArrival: input?.mysteryArrival !== false,
        mysteryPurchase: input?.mysteryPurchase !== false,
    };
}
//# sourceMappingURL=notification-types.js.map