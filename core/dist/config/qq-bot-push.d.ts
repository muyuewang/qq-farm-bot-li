import type { QqBotPushConfig } from '../types/config';
/** QQ 机器人事件白名单（键为日志 meta.event，值为推送面板展示名）。 */
export declare const QQ_BOT_EVENT_LABELS: Record<string, string>;
export declare const QQ_BOT_EVENT_KEYS: Set<string>;
/** 面板默认勾选的事件（与前端 QQ_BOT_EVENT_OPTIONS 保持一致）。 */
export declare const DEFAULT_QQ_BOT_EVENT_KEYS: string[];
export declare function defaultQqBotPushConfig(): QqBotPushConfig;
/** 归一化 QQ 机器人推送配置；非法值与越界数值回落默认值。 */
export declare function normalizeQqBotPushConfig(input?: Partial<QqBotPushConfig> | null): QqBotPushConfig;
//# sourceMappingURL=qq-bot-push.d.ts.map