"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ranch_animals_1 = require("../../config/ranch-animals");
const MCCanConfig_json_1 = __importDefault(require("../../gameConfig/ranch/MCCanConfig.json"));
const MCFacilityConfig_json_1 = __importDefault(require("../../gameConfig/ranch/MCFacilityConfig.json"));
const MCItemInfo_json_1 = __importDefault(require("../../gameConfig/ranch/MCItemInfo.json"));
const MCTask_json_1 = __importDefault(require("../../gameConfig/ranch/MCTask.json"));
const BigFarmLevel_json_1 = __importDefault(require("../../gameConfig/ranch/BigFarmLevel.json"));
const MCAnimalMutation_json_1 = __importDefault(require("../../gameConfig/ranch/MCAnimalMutation.json"));
const { getItemById, getItemImageById, getShopGoodsById } = require('../../config/gameConfig');
const canMap = new Map(MCCanConfig_json_1.default.map(row => [row.id, row]));
const facilityMap = new Map(MCFacilityConfig_json_1.default.map(row => [row.facility_id, row]));
const itemMap = new Map(MCItemInfo_json_1.default.map(row => [row.id, row]));
const taskMap = new Map(MCTask_json_1.default.map(row => [row.id, row]));
const mutationMap = new Map(MCAnimalMutation_json_1.default.map(row => [row.animal_id, row]));
function error(code, message) {
    return Object.assign(new Error(message), { code });
}
function positiveId(value, label) {
    const text = String(value ?? '').trim();
    if (!/^[1-9]\d{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n)
        throw error('INVALID_ARGUMENT', `${label}无效`);
    return text;
}
function positiveCount(value) {
    const text = positiveId(value, '数量');
    const count = Number(text);
    if (!Number.isSafeInteger(count) || count > 2147483647)
        throw error('INVALID_ARGUMENT', '数量超出范围');
    return count;
}
function quantity(value) {
    return value == null ? '0' : value.toString();
}
function itemDto(item) {
    const id = Number(item.id);
    const metadata = itemMap.get(id) || getItemById(id);
    if (id === 7003 || id === 7004)
        return { id, count: quantity(item.count), name: id === 7003 ? '普通罐头桶' : '有机罐头桶', image: getItemImageById(id === 7003 ? 80021 : 80031) };
    return { id, count: quantity(item.count), name: metadata?.name || `物品${id}`, image: getItemImageById(id) };
}
function pendingOperationView(operation) {
    let label = operation.label;
    const goodsId = operation.target.match(/^ranch:buy:(\d+)$/)?.[1];
    if (label === '购买牧场商品' && goodsId) {
        const goods = getShopGoodsById(Number(goodsId));
        if (goods)
            label = `购买${itemDto({ id: goods.item_id }).name}`;
    }
    return { ...operation, label, costs: operation.costs.map((cost) => ({ ...cost,
            name: itemDto({ id: Number(cost.resourceKey.slice(5)) }).name,
        })) };
}
function sumItems(items) {
    const totals = new Map();
    for (const item of items)
        totals.set(Number(item.id), (totals.get(Number(item.id)) || 0n) + BigInt(quantity(item.count)));
    return [...totals].map(([id, count]) => itemDto({ id, count }));
}
function signature(items) {
    return sumItems(items).filter(item => BigInt(item.count) !== 0n).map(item => `${item.id}:${item.count}`).sort().join('|');
}
function levelInfo(exp) {
    const current = [...BigFarmLevel_json_1.default].reverse().find(row => row.exp <= exp);
    const next = BigFarmLevel_json_1.default.find(row => row.level === current.level + 1);
    return { level: current.level, exp, currentExp: exp - current.exp, neededExp: next ? next.exp - current.exp : null };
}
module.exports = { animalMap: ranch_animals_1.animalMap, mutationMap, cubMap: ranch_animals_1.cubMap, canMap, facilityMap, itemMap, taskMap, error, positiveId, positiveCount, quantity, itemDto, pendingOperationView, sumItems, signature, levelInfo };
//# sourceMappingURL=model.js.map