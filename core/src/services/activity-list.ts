export {};
/**
 * ActivityService.List 的共享读取入口。
 *
 * 官方客户端在登录阶段只读取一次完整活动列表。目录与公益详情复用同一份短时
 * 回包，既避免紧邻的重复网关请求，也保证两处使用完全相同的动态活动节点。
 */

const { sendMsgAsync, networkEvents } = require('../utils/network');
const { types } = require('../utils/proto');
const { createActivityListCache } = require('./activity-list-cache');
const { createModuleLogger } = require('./logger');

const activityListLogger = createModuleLogger('activity-list');

async function loadActivityListReply(loadId: number): Promise<any> {
    const startedAt = Date.now();
    try {
        const body = Buffer.from(types.ActivityListRequest.encode(types.ActivityListRequest.create({})).finish());
        const { body: replyBody } = await sendMsgAsync(
            'gamepb.activitypb.ActivityService',
            'List',
            body,
        );
        const reply = types.ActivityListReply.decode(replyBody);
        activityListLogger.info('活动列表网关读取完成', {
            event: 'activity_list_gateway',
            stage: 'activity.list.reply',
            loadId,
            durationMs: Date.now() - startedAt,
            rootActivityCount: Array.isArray(reply?.activities) ? reply.activities.length : 0,
            activityWindowCount: Array.isArray(reply?.activity_windows) ? reply.activity_windows.length : 0,
        });
        return reply;
    } catch (error: any) {
        activityListLogger.warn('活动列表网关读取失败', {
            event: 'activity_list_gateway',
            stage: 'activity.list.request',
            loadId,
            durationMs: Date.now() - startedAt,
            failureType: String(error?.code || error?.name || 'Error'),
            failureMessage: String(error?.message || error || 'ActivityService.List failed'),
        });
        throw error;
    }
}

const activityListCache = createActivityListCache(loadActivityListReply);

function getActivityListReply(
    maxAgeMs = 0,
    diagnostics: { traceId?: unknown; consumer?: unknown } = {},
): Promise<any> {
    const traceId = String(diagnostics?.traceId || '').trim();
    const consumer = String(diagnostics?.consumer || 'activity').trim() || 'activity';
    return activityListCache.get(maxAgeMs, (access: any) => {
        activityListLogger.info('活动列表读取来源', {
            event: 'activity_list_access',
            stage: 'activity.list.cache',
            ...(traceId ? { traceId } : {}),
            consumer,
            cacheSource: access.source,
            loadId: access.loadId,
            ageMs: access.ageMs,
            reuseWindowMs: Math.max(0, Number(maxAgeMs) || 0),
        });
    });
}

function invalidateActivityListReply(): void {
    activityListCache.invalidate();
}

networkEvents.on('activitiesChanged', invalidateActivityListReply);
networkEvents.on('disconnected', invalidateActivityListReply);

module.exports = {
    getActivityListReply,
    invalidateActivityListReply,
};
