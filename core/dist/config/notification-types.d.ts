export interface NotificationTypes {
    offline: boolean;
    mysteryArrival: boolean;
    mysteryPurchase: boolean;
}
export interface PushNotification {
    type: keyof NotificationTypes;
    title: string;
    content: string;
}
export declare function normalizeNotificationTypes(input?: Partial<NotificationTypes>): NotificationTypes;
//# sourceMappingURL=notification-types.d.ts.map