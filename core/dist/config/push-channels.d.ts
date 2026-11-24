import type { OfflineReminder, OfflineReminderChannel } from '../types/config';
export declare const PUSHOO_CHANNELS: Set<string>;
export declare function normalizePushChannel(input: Partial<OfflineReminderChannel>): OfflineReminderChannel;
export declare function isPushChannelConfigured(entry: OfflineReminderChannel): boolean;
export declare function readPushChannels(config: Partial<OfflineReminder>): OfflineReminderChannel[];
export declare function singlePushChannel(saved: OfflineReminder, update: Partial<OfflineReminderChannel>): OfflineReminderChannel;
//# sourceMappingURL=push-channels.d.ts.map