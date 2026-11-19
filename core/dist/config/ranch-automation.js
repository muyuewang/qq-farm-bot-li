"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANCH_MARKET_SWITCH_KEYS = exports.RANCH_ANIMAL_OPTIONS = exports.RANCH_SWITCH_KEYS = exports.RANCH_AUTOMATION_DEFAULTS = void 0;
exports.normalizeRanchSetting = normalizeRanchSetting;
exports.migrateRanchMarketAutomation = migrateRanchMarketAutomation;
exports.isRanchMarketEnabled = isRanchMarketEnabled;
const ranch_animals_1 = require("./ranch-animals");
exports.RANCH_AUTOMATION_DEFAULTS = {
    ranch_harvest: true,
    ranch_produce: true,
    ranch_buy: true,
    ranch_upgrade: true,
    ranch_sell: true,
    // 旧总开关仅用于兼容旧配置；运行时分别检查两种货币开关。
    ranch_market_organic: true,
    ranch_market_organic_poop: true,
    ranch_market_organic_pinecone: true,
    ranch_grass: true,
    ranch_grass_buy: true,
    ranch_grass_threshold_percent: 20,
    ranch_fill_cans: true,
    ranch_feed_normal: true,
    ranch_feed_organic: true,
    ranch_clean: true,
    ranch_stroke: true,
    ranch_friend_steal: true,
    ranch_friend_clean: true,
    ranch_friend_mosquito: true,
    ranch_task: true,
    ranch_illustrated: true,
    ranch_share: true,
    ranch_daily_benefit: true,
    ranch_check_minutes: 5,
    ranch_strategy: 'level',
    ranch_bag_fallback: 'level',
    ranch_coop_animal: 0,
    ranch_shed_animal: 0,
    ranch_coop_cub_priority: [],
    ranch_shed_cub_priority: [],
};
exports.RANCH_SWITCH_KEYS = Object.keys(exports.RANCH_AUTOMATION_DEFAULTS).filter(key => typeof exports.RANCH_AUTOMATION_DEFAULTS[key] === 'boolean');
exports.RANCH_ANIMAL_OPTIONS = [...ranch_animals_1.animalMap.values()].filter(animal => animal.enable_flag).map(animal => ({ value: animal.id, label: animal.name, kind: animal.husbandry_type }));
function normalizeRanchSetting(key, value) {
    if (key === 'ranch_strategy' || key === 'ranch_bag_fallback') {
        const allowed = key === 'ranch_strategy' ? ['level', 'preferred', 'bag_priority'] : ['level', 'preferred'];
        if (!allowed.includes(String(value)))
            throw Object.assign(new Error('请选择有效的养殖策略'), { code: 'INVALID_CONFIG' });
        return String(value);
    }
    if (key === 'ranch_coop_animal' || key === 'ranch_shed_animal') {
        const id = Number(value);
        if (id !== 0 && !exports.RANCH_ANIMAL_OPTIONS.some(animal => animal.value === id && animal.kind === (key === 'ranch_coop_animal' ? '窝' : '棚'))) {
            throw Object.assign(new Error('所选动物不适用于当前窝或棚'), { code: 'INVALID_CONFIG' });
        }
        return id;
    }
    if (key === 'ranch_coop_cub_priority' || key === 'ranch_shed_cub_priority') {
        const housing = key === 'ranch_coop_cub_priority' ? '窝' : '棚';
        if (!Array.isArray(value) || value.some(id => ranch_animals_1.cubMap.get(id)?.husbandry_type !== housing)) {
            throw Object.assign(new Error(`${housing}的背包顺序只能包含适用于${housing}的幼崽`), { code: 'INVALID_CONFIG' });
        }
        return [...new Set(value)];
    }
    if (key === 'ranch_check_minutes') {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 60) {
            throw Object.assign(new Error('牧场巡查间隔必须是 1–60 的整数分钟'), { code: 'INVALID_CONFIG' });
        }
        return number;
    }
    if (key === 'ranch_grass_threshold_percent') {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 100) {
            throw Object.assign(new Error('牧草补充阈值必须是 1–100 的整数百分比'), { code: 'INVALID_CONFIG' });
        }
        return number;
    }
    if (typeof value !== 'boolean')
        throw Object.assign(new Error('牧场开关必须为布尔值'), { code: 'INVALID_CONFIG' });
    return value;
}
exports.RANCH_MARKET_SWITCH_KEYS = ['ranch_market_organic_poop', 'ranch_market_organic_pinecone'];
/** 旧配置的总开关只填充缺失的新字段，已明确设置的独立开关优先。 */
function migrateRanchMarketAutomation(input) {
    const result = { ...input };
    if (typeof result.ranch_market_organic === 'boolean') {
        for (const key of exports.RANCH_MARKET_SWITCH_KEYS) {
            if (result[key] === undefined)
                result[key] = result.ranch_market_organic;
        }
    }
    return result;
}
function isRanchMarketEnabled(input) {
    return exports.RANCH_MARKET_SWITCH_KEYS.some(key => (input[key] ?? input.ranch_market_organic) === true);
}
//# sourceMappingURL=ranch-automation.js.map