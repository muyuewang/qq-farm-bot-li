"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { getAllLands, fertilizeBatch } = require('./api');
const { buildLandDetail, buildLandMap } = require('./land-analysis');
const { toNum, getServerTimeSec, log } = require('../../utils/utils');
const { recordOperation } = require('../stats');
let pending = false;
async function fertilizeAllOwnLands(fertilizerType) {
    if (fertilizerType !== 'normal' && fertilizerType !== 'organic') {
        throw new Error('化肥类型必须是 normal 或 organic');
    }
    if (pending)
        throw new Error('一键施肥正在进行，请稍后再试');
    pending = true;
    try {
        // 执行时重新读取，不能使用浏览器里可能已成熟或被重新种植的快照。
        const snapshot = await getAllLands();
        if (!Array.isArray(snapshot?.lands))
            throw new Error('无法读取最新土地，请刷新后重试');
        const landsMap = buildLandMap(snapshot.lands);
        const nowSec = getServerTimeSec();
        const targets = [...new Set(snapshot.lands.map((land) => (buildLandDetail(land, { landsMap, nowSec }))).filter((land) => (land.unlocked && !land.occupiedByMaster && land.status === 'growing'
                && land.matureInSec > 0 && toNum(land.id) > 0)).map((land) => toNum(land.id)))];
        const base = { fertilizerType, requestedCount: targets.length, successCount: 0, skippedCount: 0,
            fertilizerConsumedSec: 0, fertilizerRemainingSec: null, updatedLands: [] };
        if (!targets.length)
            return base;
        const fertilizerId = fertilizerType === 'organic' ? 1012 : 1011;
        // 仅发送一次；超时和部分成功均不自动重试，避免重复推进阶段或消耗化肥。
        const reply = await fertilizeBatch(targets, fertilizerId);
        const updates = Array.isArray(reply?.land) ? reply.land : [];
        const targetSet = new Set(targets);
        const succeeded = new Set(updates.map(land => toNum(land.id)).filter(id => targetSet.has(id)));
        const drops = Array.isArray(reply?.land_op_drops) ? reply.land_op_drops : [];
        const consumed = drops.flatMap(drop => drop.costs || [])
            .filter(item => toNum(item.id) === fertilizerId)
            .reduce((sum, item) => sum + toNum(item.count), 0);
        // 合并完整地块关系再生成前端详情，避免多格作物的副地块失去归属。
        const merged = new Map(snapshot.lands.map((land) => [toNum(land.id), land]));
        for (const land of updates)
            merged.set(toNum(land.id), land);
        const updatedMap = buildLandMap([...merged.values()]);
        const result = { ...base, successCount: succeeded.size, skippedCount: targets.length - succeeded.size,
            fertilizerConsumedSec: drops.length ? consumed : null,
            fertilizerRemainingSec: reply?.fertilizer ? toNum(reply.fertilizer.count) : null,
            updatedLands: [...merged.values()].map(land => buildLandDetail(land, { landsMap: updatedMap, nowSec: getServerTimeSec() })) };
        if (succeeded.size)
            recordOperation('fertilize', succeeded.size);
        log('施肥', `一键施肥：${fertilizerType === 'organic' ? '有机化肥' : '普通化肥'}已施 ${succeeded.size}/${targets.length} 株作物`, {
            module: 'farm', event: '一键施肥', result: succeeded.size ? 'ok' : 'skip',
            type: fertilizerType, count: succeeded.size, consumedSec: result.fertilizerConsumedSec,
        });
        return result;
    }
    finally {
        pending = false;
    }
}
module.exports = { fertilizeAllOwnLands };
//# sourceMappingURL=fertilize-all.js.map