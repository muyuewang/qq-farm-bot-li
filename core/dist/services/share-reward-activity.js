"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const share_reward_instances_json_1 = __importDefault(require("../activity-data/share-reward-instances.json"));
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { getServerTimeSec, toNum } = require('../utils/utils');
const { getItemById, getItemImageById } = require('../config/gameConfig');
// Operation numbers belong to the client protocol, not to an activity instance.
// Verified against the 1.15.0.1_20261001 official encoder.
const OPERATIONS = {
    share: { cmd: 70, field: 'share_reward_share' },
    milestones: { cmd: 71, field: 'share_reward_claim_milestones' },
    logs: { cmd: 72, field: 'share_reward_get_logs' },
    daily: { cmd: 74, field: 'share_reward_claim_daily' },
};
// Module state is scoped to one account worker. Reads before writes are serialized.
let mutationTail = Promise.resolve();
function fail(code, message) {
    throw Object.assign(new Error(message), { code });
}
function instanceFor(activityId) {
    const instance = share_reward_instances_json_1.default.find(entry => entry.activityId === String(activityId));
    return instance || fail('INVALID_SHARE_REWARD_ACTIVITY', '未知的快乐不独享活动');
}
function reward(item) {
    const id = toNum(item.id);
    return { id, count: toNum(item.count), name: getItemById(id)?.name || `物品 #${id}`, image: getItemImageById(id) };
}
function findEntry(entry, id) {
    if (String(entry?.activity?.activity_id) === id)
        return entry;
    for (const child of entry?.children || []) {
        const found = findEntry(child, id);
        if (found)
            return found;
    }
    return null;
}
async function getShareRewardActivity(activityId) {
    const instance = instanceFor(activityId);
    const body = types.GetGroupRequest.encode({ group_id: instance.groupId }).finish();
    const response = await sendMsgAsync('gamepb.activitypb.ActivityService', 'GetGroup', body);
    const entry = findEntry(types.GetGroupReply.decode(response.body).group, instance.activityId);
    const summary = entry?.share_reward?.summary;
    if (!summary?.daily)
        fail('SHARE_REWARD_STATE_UNAVAILABLE', '活动进度未返回，请稍后刷新');
    const head = entry.activity;
    const now = getServerTimeSec();
    const startTime = toNum(head.begin_time);
    const endTime = toNum(head.end_time);
    const active = startTime <= now && endTime > now;
    let rules = [];
    try {
        rules = JSON.parse(Buffer.from(head.extra || []).toString('utf8')).tips.txt.filter((v) => typeof v === 'string').map((v) => v.replace(/<[^>]+>/g, ''));
    }
    catch { }
    return {
        id: instance.activityId, title: instance.title, icon: instance.icon,
        serverTime: now * 1000, startTime: startTime * 1000, endTime: endTime * 1000, active, rules,
        score: toNum(summary.current_score), scoreItemId: toNum(summary.score_item_id),
        dailyReward: toNum(summary.daily_reward), firstShareReward: toNum(summary.first_share_reward),
        claimedCount: toNum(summary.daily.claimed_count), claimLimit: toNum(summary.daily.claim_limit),
        poolClaimedCount: toNum(summary.my_pool?.claimed_count), poolClaimLimit: toNum(summary.my_pool?.claim_limit),
        canClaimDaily: active && !summary.daily.daily_reward_claimed,
        canShare: active && !summary.daily.first_share_awarded, firstShareAwarded: !!summary.daily.first_share_awarded,
        canClaimMilestones: active && (summary.milestones || []).some((v) => toNum(v.state) === 2),
        milestones: (summary.milestones || []).map((v) => ({ id: String(v.tier_id), threshold: toNum(v.threshold), state: toNum(v.state), rewards: (v.rewards || []).map(reward) })),
    };
}
async function performOperation(activityId, action, input) {
    const instance = instanceFor(activityId);
    const operation = Object.hasOwn(OPERATIONS, action) ? OPERATIONS[action] : null;
    if (!operation)
        fail('INVALID_SHARE_REWARD_OPERATION', '未知活动操作');
    const state = await getShareRewardActivity(instance.activityId);
    if (!state.active)
        fail('SHARE_REWARD_ENDED', '活动尚未开放或已经结束');
    if (action === 'daily' && !state.canClaimDaily)
        fail('HAPPY_DAILY_CLAIMED', '今日快乐值已领取');
    if (action === 'share' && !state.canShare)
        fail('HAPPY_SHARE_CLAIMED', '今日分享奖励已领取');
    if (action === 'milestones' && !state.canClaimMilestones)
        fail('HAPPY_MILESTONE_UNAVAILABLE', '当前没有可领取的档位奖励');
    const params = action === 'logs' ? { page: -1, page_size: 100, tab: input?.tab === 0 ? 0 : 1 } : {};
    const body = types.AutumnOperateRequest.encode({ activity_id: instance.activityId, operate_type: operation.cmd, [operation.field]: params }).finish();
    const response = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body);
    const reply = types.ActivityOperateReply.decode(response.body);
    if (String(reply.activity_id) !== instance.activityId || toNum(reply.operate_type) !== operation.cmd || !reply[operation.field]) {
        fail('SHARE_REWARD_RESPONSE_INVALID', '操作回包不完整，请刷新确认结果，勿重复提交');
    }
    let result = types.ActivityOperateReply.toObject(reply, { longs: String, bytes: String })[operation.field];
    // Share credentials are never exposed to the browser or used to send messages.
    if (action === 'share')
        result = { granted_score: result.granted_score || '0' };
    if (action === 'logs')
        result = {
            total: result.total || 0,
            logs: (result.logs || []).map((entry) => ({
                seq: entry.seq, kind: entry.kind, score: entry.score, created_at: entry.created_at,
                actor: entry.actor ? { name: entry.actor.name } : undefined,
            })),
        };
    const rewards = (reply[operation.field].awards || reply[operation.field].rewards || []).map(reward);
    try {
        return { activity: await getShareRewardActivity(instance.activityId), result, rewards };
    }
    catch {
        return { activity: null, result, rewards, refreshRequired: true };
    }
}
function operateShareRewardActivity(activityId, action, input = {}) {
    const result = mutationTail.then(() => performOperation(activityId, action, input));
    mutationTail = result.catch(() => { });
    return result;
}
module.exports = { getShareRewardActivity, operateShareRewardActivity };
//# sourceMappingURL=share-reward-activity.js.map