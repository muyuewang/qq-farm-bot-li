"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toLong, toNum, logWarn } = require('../utils/utils');
async function getCareerInfo(gid) {
    const numericGid = toNum(gid);
    if (!numericGid)
        throw new Error('缺少有效的角色 GID');
    const body = types.CareerInfoGetRequest.encode(types.CareerInfoGetRequest.create({
        gid: toLong(numericGid),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.careerpb.CareerService', 'CareerInfoGet', body);
    const reply = types.CareerInfoGetReply.toObject(types.CareerInfoGetReply.decode(replyBody), { longs: Number, defaults: true });
    const ranch = reply.ranch;
    return {
        gid: toNum(reply.gid) || numericGid,
        harvest: toNum(reply.total_harvest_count ?? reply.totalHarvestCount),
        steal: toNum(reply.total_steal_count ?? reply.totalStealCount),
        level: toNum(reply.level),
        name: String(reply.name || ''),
        ranch: ranch ? {
            harvest: toNum(ranch.total_harvest_count),
            mature: toNum(ranch.total_mature_count),
            steal: toNum(ranch.total_steal_count),
            products: ranch.harvest_items.map((item) => ({ id: toNum(item.item_id), count: toNum(item.harvest_count) })),
        } : null,
    };
}
async function getCareerInfoOrNull(gid, propagateErrors = false) {
    try {
        return await getCareerInfo(gid);
    }
    catch (error) {
        if (propagateErrors)
            throw error;
        logWarn('生涯', `查询失败: ${error && error.message ? error.message : error}`);
        return null;
    }
}
module.exports = { getCareerInfo, getCareerInfoOrNull };
//# sourceMappingURL=career.js.map