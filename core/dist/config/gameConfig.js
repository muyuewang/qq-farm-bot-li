"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Goods_json_1 = __importDefault(require("../gameConfig/Goods.json"));
/**
 * 游戏配置数据模块
 * 从 gameConfig 目录加载配置数据
 */
const fs = require('node:fs');
const path = require('node:path');
const { getResourcePath } = require('./runtime-paths');
const { isSellConditionSatisfied } = require('./sell-conditions');
// ============ 等级经验表 ============
let roleLevelConfig = null;
let levelExpTable = null;
// ============ 植物配置 ============
let plantConfig = null;
const plantMap = new Map();
const seedToPlant = new Map();
const fruitToPlant = new Map();
let itemInfoConfig = null;
const itemInfoMap = new Map();
const seedItemMap = new Map();
const shopGoodsMap = new Map(Goods_json_1.default.map(goods => [goods.id, goods]));
const itemImageIds = new Set();
const iconImageIds = new Map();
const assetImageIds = new Map();
let landConfig = null;
const landConfigMap = new Map();
const landCoordinateMap = new Map();
let mutantEffectConfig = null;
const mutantEffectMap = new Map();
let illustratedConfig = null;
const illustratedItemMap = new Map();
let buffConfig = null;
const buffConfigMap = new Map();
// ============ 无效植物（官方配置里留着、实际不可获得的白萝卜 29999 等） ============
// 只拦候选池/物品/背包入口；plantMap 保留完整资料，否则地里已种下的作物会被误判成空地。
let invalidPlantIds = new Set();
let invalidSeedIds = new Set();
// ============ 变异来源与概率（MutantGroupSource / MutantPublicity） ============
const mutantGroupSourceMap = new Map();
const mutantPublicityMap = new Map();
// ============ 作物生长阶段贴图（plant_images/manifest.json：Crop_<编号> → 阶段 → URL） ============
const plantPhaseImageMap = new Map();
function isInvalidSeedId(seedId) {
    return invalidSeedIds.has(Number(seedId) || 0);
}
function isInvalidPlant(plant) {
    return invalidPlantIds.has(Number(plant && plant.id))
        || isInvalidSeedId(plant && plant.seed_id);
}
function filterInvalidPlants(plants) {
    return (Array.isArray(plants) ? plants : []).filter(plant => !isInvalidPlant(plant));
}
// 官方活动说明确认：变异 13 为鹊羽活动效果，收获时会额外获得鹊羽。
// 运行时 MutantEffect 暂未下发 tips/description，因此在展示 DTO 层补充说明。
const MUTANT_EFFECT_DESCRIPTION_FALLBACKS = new Map([
    [13, '特殊活动变异，收获时可额外获得鹊羽。'],
]);
function getLandCoordinateKey(gridX, gridY) {
    return `${gridX},${gridY}`;
}
/**
 * 加载配置文件
 */
function loadConfigs() {
    const configDir = getResourcePath('gameConfig');
    // 加载等级经验配置
    try {
        const roleLevelPath = path.join(configDir, 'RoleLevel.json');
        if (fs.existsSync(roleLevelPath)) {
            roleLevelConfig = JSON.parse(fs.readFileSync(roleLevelPath, 'utf8'));
            levelExpTable = [];
            for (const item of roleLevelConfig) {
                levelExpTable[item.level] = item.exp;
            }
            console.warn(`[配置] 已加载等级经验表 (${roleLevelConfig.length} 级)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 RoleLevel.json 失败:', e.message);
    }
    // 加载无效植物清单（白萝卜 29999 等）：官方 Plant/ItemInfo 里有，但种不出来也买不到，
    // 不能进种子列表、收益排行和背包识别。
    invalidPlantIds = new Set();
    invalidSeedIds = new Set();
    try {
        const invalidPath = path.join(configDir, 'InvalidPlants.json');
        if (fs.existsSync(invalidPath)) {
            const invalid = JSON.parse(fs.readFileSync(invalidPath, 'utf8'));
            invalidPlantIds = new Set((invalid.plant_ids || []).map(Number).filter((id) => id > 0));
            invalidSeedIds = new Set((invalid.seed_ids || []).map(Number).filter((id) => id > 0));
            if (invalidPlantIds.size || invalidSeedIds.size) {
                console.warn(`[配置] 已加载无效植物清单 (${invalidPlantIds.size} 种植物 / ${invalidSeedIds.size} 个种子)`);
            }
        }
    }
    catch (e) {
        console.warn('[配置] 加载 InvalidPlants.json 失败:', e.message);
    }
    // 加载植物配置
    try {
        const plantPath = path.join(configDir, 'Plant.json');
        if (fs.existsSync(plantPath)) {
            plantConfig = JSON.parse(fs.readFileSync(plantPath, 'utf8'));
            plantMap.clear();
            seedToPlant.clear();
            fruitToPlant.clear();
            for (const plant of plantConfig) {
                plantMap.set(plant.id, plant);
                if (plant.seed_id) {
                    seedToPlant.set(plant.seed_id, plant);
                }
                if (plant.fruit && plant.fruit.id) {
                    fruitToPlant.set(plant.fruit.id, plant);
                }
            }
            console.warn(`[配置] 已加载植物配置 (${plantConfig.length} 种)`);
        }
        // 活动植物通常早于全量静态配置发布，用轻量增量表补齐植物/种子/果实三者关系。
        // 全量表已存在的 ID 不覆盖（同名不同 ID 时以全量表为准）。
        const eventPlantPath = path.join(configDir, 'EventPlants.json');
        if (fs.existsSync(eventPlantPath)) {
            const eventPlants = JSON.parse(fs.readFileSync(eventPlantPath, 'utf8'));
            let merged = 0;
            for (const entry of eventPlants || []) {
                if (isInvalidPlant(entry))
                    continue;
                const plantId = Number(entry && entry.id) || 0;
                const seedId = Number(entry && entry.seed_id) || 0;
                if (plantId <= 0)
                    continue;
                const existing = plantMap.get(plantId);
                // 已存在但缺 seed_id 的黄金形态/活动作物：只补种子与果实映射，不动原有资料。
                if (existing) {
                    if (!existing.seed_id && seedId > 0) {
                        existing.seed_id = seedId;
                        seedToPlant.set(seedId, existing);
                        merged += 1;
                    }
                    continue;
                }
                if (seedId > 0 && seedToPlant.has(seedId))
                    continue;
                const fruitId = Number(entry && entry.fruit_id) || 0;
                // 活动表条目字段不全，补齐 PlantItem 必须有默认值的字段，
                // 避免图鉴/展示层读 offsetPosition 等深层属性时报错。
                const plant = {
                    id: plantId,
                    name: String(entry && entry.name || `植物${plantId}`),
                    seed_id: seedId || null,
                    fruit: { id: fruitId, count: Number(entry && entry.fruit_count) || 0 },
                    asset_name: String(entry && entry.asset_name || ''),
                    size: Math.max(1, Number(entry && entry.size) || 1),
                    seasons: Number(entry && entry.seasons) || 1,
                    grow_phases: String(entry && entry.grow_phases || ''),
                    exp: Number(entry && entry.exp) || 0,
                    mutant_effect_plant: (entry && entry.mutant_effect_plant) || null,
                    land_level_need: Number(entry && entry.level) || 1,
                    special_fruit: null,
                    offsetPosition: { x: 0, y: 0 },
                    mutantEffectScale: { x: 1, y: 1 },
                    harvestOffsetPosition: { x: 0, y: 0 },
                    harvestRandom: false,
                    harvestAllSpineRes: null,
                    harvestAllOffsetPosition: null,
                    harvestAniName: '',
                    all_state_spine: (entry && entry.all_state_spine) || null,
                    mature_effect: '',
                    mature_effect_offset: { x: 0, y: 0 },
                    rare_plant_light_pos: null,
                    exp_root: 0,
                    exp_alter: 0,
                    fruit_root: 0,
                    fruit_alter: 0,
                };
                plantMap.set(plantId, plant);
                if (seedId > 0)
                    seedToPlant.set(seedId, plant);
                if (fruitId > 0)
                    fruitToPlant.set(fruitId, plant);
                merged += 1;
            }
            plantConfig = Array.from(plantMap.values());
            if (merged > 0)
                console.warn(`[配置] 已合并活动植物配置 (${merged} 种新增/补种)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 Plant.json 失败:', e.message);
    }
    // 加载物品配置（含种子/果实价格）
    try {
        const itemInfoPath = path.join(configDir, 'ItemInfo.json');
        if (fs.existsSync(itemInfoPath)) {
            itemInfoConfig = JSON.parse(fs.readFileSync(itemInfoPath, 'utf8'));
            itemInfoMap.clear();
            seedItemMap.clear();
            for (const item of itemInfoConfig) {
                // 兼容处理：ItemInfo.json 中 trait_id 字段名带尾部空格
                const raw = item;
                if ('trait_id ' in raw && !('trait_id' in raw)) {
                    raw.trait_id = raw['trait_id '];
                    delete raw['trait_id '];
                }
                const id = Number(item && item.id) || 0;
                if (id <= 0 || isInvalidSeedId(id))
                    continue;
                itemInfoMap.set(id, item);
                if (Number(item.type) === 5) {
                    seedItemMap.set(id, item);
                }
            }
            console.warn(`[配置] 已加载物品配置 (${itemInfoConfig.length} 项)`);
        }
        // 活动植物的种子/果实官方 ItemInfo 可能还没下发，按增量表补一份，
        // 避免背包里认得出作物却认不出物品。已有条目一律不覆盖。
        const eventItemPath = path.join(configDir, 'EventPlants.json');
        if (fs.existsSync(eventItemPath)) {
            const eventPlants = JSON.parse(fs.readFileSync(eventItemPath, 'utf8'));
            let added = 0;
            for (const entry of eventPlants || []) {
                if (isInvalidPlant(entry))
                    continue;
                const seedId = Number(entry && entry.seed_id) || 0;
                const plant = seedId > 0 ? seedToPlant.get(seedId) : undefined;
                const fruitId = Number(plant && plant.fruit && plant.fruit.id) || Number(entry && entry.fruit_id) || 0;
                const name = String(plant && plant.name || entry && entry.name || '');
                const assetName = String(plant && plant.asset_name || entry && entry.asset_name || '');
                if (!name)
                    continue;
                const base = {
                    asset_name: assetName,
                    icon_res: '',
                    level: Number(entry && entry.level) || Number(plant && plant.land_level_need) || 1,
                    rarity: Math.max(3, Number(entry && entry.rarity) || 0),
                    rarity_color: (entry && entry.rarity_color) || 'EEC55A',
                };
                if (seedId > 0 && !itemInfoMap.has(seedId)) {
                    const seedItem = {
                        ...base,
                        id: seedId,
                        type: 5,
                        name: `${name}种子`,
                        interaction_type: 'plant',
                        max_count: 9999,
                        max_own: 9999,
                        desc: `种植后，可以收获一定数量的${name}。`,
                        effectDesc: name,
                    };
                    itemInfoMap.set(seedId, seedItem);
                    seedItemMap.set(seedId, seedItem);
                    added += 1;
                }
                if (fruitId > 0 && !itemInfoMap.has(fruitId)) {
                    const fruitItem = {
                        ...base,
                        id: fruitId,
                        type: 2,
                        name,
                        desc: `收获自${name}的果实。`,
                        effectDesc: name,
                    };
                    itemInfoMap.set(fruitId, fruitItem);
                    added += 1;
                }
            }
            if (added > 0)
                console.warn(`[配置] 已补齐活动植物物品 (${added} 项)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 ItemInfo.json 失败:', e.message);
    }
    // 加载土地网格配置（多格作物布局）
    try {
        const landPath = path.join(configDir, 'Land.json');
        if (fs.existsSync(landPath)) {
            landConfig = JSON.parse(fs.readFileSync(landPath, 'utf8'));
            landConfigMap.clear();
            landCoordinateMap.clear();
            for (const land of landConfig) {
                const id = Number(land && land.id) || 0;
                const gridX = Number(land && land.grid_x);
                const gridY = Number(land && land.grid_y);
                if (id <= 0 || !Number.isInteger(gridX) || !Number.isInteger(gridY))
                    continue;
                landConfigMap.set(id, land);
                landCoordinateMap.set(getLandCoordinateKey(gridX, gridY), land);
            }
            console.warn(`[配置] 已加载土地网格配置 (${landConfigMap.size} 块)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 Land.json 失败:', e.message);
    }
    try {
        const mutantPath = path.join(configDir, 'MutantEffect.json');
        if (fs.existsSync(mutantPath)) {
            mutantEffectConfig = JSON.parse(fs.readFileSync(mutantPath, 'utf8'));
            mutantEffectMap.clear();
            for (const mutant of mutantEffectConfig || []) {
                const mutantId = Number(mutant && mutant.id) || 0;
                if (mutantId <= 0)
                    continue;
                mutantEffectMap.set(mutantId, mutant);
            }
            console.warn(`[配置] 已加载变异效果配置 (${mutantEffectMap.size} 种)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 MutantEffect.json 失败:', e.message);
    }
    try {
        const illustratedPath = path.join(configDir, 'Illustrated.json');
        if (fs.existsSync(illustratedPath)) {
            illustratedConfig = JSON.parse(fs.readFileSync(illustratedPath, 'utf8'));
            illustratedItemMap.clear();
            for (const entry of illustratedConfig || []) {
                const itemId = Number(entry && entry.param) || 0;
                if (itemId > 0)
                    illustratedItemMap.set(itemId, entry);
            }
            console.warn(`[配置] 已加载图鉴配置 (${illustratedItemMap.size} 项)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 Illustrated.json 失败:', e.message);
    }
    // 变异公开概率（MutantPublicity）与变异来源（MutantGroupSource）：
    // 种子/图鉴需要给出"这个作物能变异成什么、概率多少、可能由什么触发"。
    try {
        mutantPublicityMap.clear();
        const publicityPath = path.join(configDir, 'collections', 'MutantPublicity.json');
        if (fs.existsSync(publicityPath)) {
            const rows = JSON.parse(fs.readFileSync(publicityPath, 'utf8'));
            for (const row of rows || []) {
                const id = Number(row && row.mutant_id) || 0;
                if (id <= 0)
                    continue;
                const list = mutantPublicityMap.get(id) || [];
                list.push({ rarity: row.rarity == null ? null : Number(row.rarity), percent: Math.round((Number(row.public_probability) || 0)) / 100 });
                mutantPublicityMap.set(id, list);
            }
            console.warn(`[配置] 已加载变异公开概率 (${mutantPublicityMap.size} 种)`);
        }
        mutantGroupSourceMap.clear();
        const groupSourcePath = path.join(configDir, 'MutantGroupSource.json');
        if (fs.existsSync(groupSourcePath)) {
            const rows = JSON.parse(fs.readFileSync(groupSourcePath, 'utf8'));
            for (const row of rows || []) {
                const groupId = Number(row && row.group_id) || 0;
                const type = String(row && row.type || '').trim();
                if (groupId <= 0 || !type)
                    continue;
                const list = mutantGroupSourceMap.get(groupId) || [];
                if (!list.includes(type))
                    list.push(type);
                mutantGroupSourceMap.set(groupId, list);
            }
            console.warn(`[配置] 已加载变异来源分组 (${mutantGroupSourceMap.size} 组)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载变异概率/来源配置失败:', e.message);
    }
    // 作物生长阶段贴图清单（官方 Crop_* 阶段贴图，阶段 1-6）。
    try {
        const manifestPath = path.join(configDir, 'plant_images', 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            plantPhaseImageMap.clear();
            for (const [key, phases] of Object.entries(manifest || {})) {
                const match = /^Crop_(\d+)$/.exec(key);
                // 条目必须是 { 阶段: URL } 对象；数组会被展开成裸数字，直接跳过。
                if (!match || !phases || typeof phases !== 'object' || Array.isArray(phases))
                    continue;
                const cropKey = Number(match[1]);
                if (cropKey <= 0)
                    continue;
                const phaseMap = new Map();
                for (const [phaseKey, url] of Object.entries(phases)) {
                    const phase = Number(phaseKey);
                    if (!Number.isInteger(phase) || phase <= 0 || !String(url || '').trim())
                        continue;
                    phaseMap.set(phase, String(url).trim());
                }
                if (phaseMap.size > 0)
                    plantPhaseImageMap.set(cropKey, phaseMap);
            }
            console.warn(`[配置] 已加载作物阶段贴图 (${plantPhaseImageMap.size} 种)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 plant_images/manifest.json 失败:', e.message);
    }
    try {
        const buffPath = path.join(configDir, 'BuffCfg.json');
        if (fs.existsSync(buffPath)) {
            buffConfig = JSON.parse(fs.readFileSync(buffPath, 'utf8'));
            buffConfigMap.clear();
            for (const entry of buffConfig || []) {
                const id = Number(entry && entry.id) || 0;
                if (id > 0)
                    buffConfigMap.set(id, entry);
            }
            console.warn(`[配置] 已加载属性加成配置 (${buffConfigMap.size} 项)`);
        }
    }
    catch (e) {
        console.warn('[配置] 加载 BuffCfg.json 失败:', e.message);
    }
    // 图片目录只在加载配置时扫描，避免列表请求为每个物品反复访问磁盘。
    itemImageIds.clear();
    iconImageIds.clear();
    assetImageIds.clear();
    try {
        const imageDir = path.join(configDir, 'seed_images_named', 'seed_images');
        for (const filename of fs.readdirSync(imageDir)) {
            if (/^[1-9]\d*\.png$/.test(filename))
                itemImageIds.add(Number(filename.slice(0, -4)));
        }
        for (const item of itemInfoMap.values()) {
            if (!itemImageIds.has(item.id))
                continue;
            const icon = getItemImageKey(item, 'icon_res');
            if (icon)
                iconImageIds.set(icon, item.id);
            // 无 icon_res 的图片由 asset_name 生成，才能作为同一物品模型的备用图。
            else {
                const asset = getItemImageKey(item, 'asset_name');
                if (asset)
                    assetImageIds.set(asset, item.id);
            }
        }
    }
    catch (e) {
        console.warn('[配置] 加载物品图片目录失败:', e.message);
    }
}
function getItemImageKey(item, field) {
    const resource = String(item[field] || '').trim().replace(/\/spriteFrame$/, '');
    return resource ? `${String(item.bundle_name || '').trim()}:${resource}` : '';
}
// ============ 等级经验相关 ============
function getLevelExpTable() {
    return levelExpTable;
}
function getLevelExpProgress(level, totalExp) {
    if (!levelExpTable || level <= 0)
        return { current: 0, needed: 0 };
    const currentLevelStart = levelExpTable[level] || 0;
    const nextLevelStart = levelExpTable[level + 1] || (currentLevelStart + 100000);
    const currentExp = Math.max(0, totalExp - currentLevelStart);
    const neededExp = nextLevelStart - currentLevelStart;
    return { current: currentExp, needed: neededExp };
}
// ============ 植物配置相关 ============
function getPlantById(plantId) {
    return plantMap.get(plantId);
}
function getPlantBySeedId(seedId) {
    return seedToPlant.get(seedId);
}
function getPlantName(plantId) {
    const plant = plantMap.get(plantId);
    return plant ? plant.name : `植物${plantId}`;
}
function getPlantNameBySeedId(seedId) {
    const plant = seedToPlant.get(seedId);
    return plant ? plant.name : `种子${seedId}`;
}
function getPlantGrowTime(plantId) {
    const plant = plantMap.get(plantId);
    if (!plant || !plant.grow_phases)
        return 0;
    const phases = plant.grow_phases.split(';').filter(p => p);
    let totalSeconds = 0;
    for (const phase of phases) {
        const match = phase.match(/:(\d+)/);
        if (match) {
            totalSeconds += Number.parseInt(match[1]);
        }
    }
    return totalSeconds;
}
/**
 * 解析官方 Plant.grow_phases。官方客户端把每项转换成内部 phase_id；
 * 服务端响应的 phases 是从当前阶段开始的配置后缀。
 */
function getPlantGrowPhases(plantId) {
    const plant = plantMap.get(Number(plantId) || 0);
    if (!plant || !plant.grow_phases)
        return [];
    return String(plant.grow_phases)
        .split(';')
        .filter(Boolean)
        .map((value, index) => {
        const separator = value.lastIndexOf(':');
        const name = separator >= 0 ? value.slice(0, separator) : value;
        const duration = separator >= 0 ? Number(value.slice(separator + 1)) || 0 : 0;
        return { index, name, duration };
    });
}
function formatGrowTime(seconds) {
    if (seconds < 60)
        return `${seconds}秒`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}分钟`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
}
function getPlantExp(plantId) {
    const plant = plantMap.get(plantId);
    return plant ? (plant.exp || 0) : 0;
}
function getFruitName(fruitId) {
    const plant = fruitToPlant.get(fruitId);
    return plant ? plant.name : `果实${fruitId}`;
}
function getPlantByFruitId(fruitId) {
    return fruitToPlant.get(fruitId);
}
/**
 * 解析 Plant.mutant_group_ids（形如 "2001;1"、"1001"），得到参与变异的组 ID。
 */
function parseMutationGroupIds(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text)
        return [];
    const ids = text.split(/[;,_\s]+/).map(value => Number(value) || 0).filter(id => id > 0);
    return [...new Set(ids)];
}
/** 该变异组允许的触发来源（自然变异/天气变异/狗狗技能变异/藏品变异…）。 */
function getMutationSources(plant) {
    const sources = [];
    for (const groupId of parseMutationGroupIds(plant.mutant_group_ids)) {
        for (const source of mutantGroupSourceMap.get(groupId) || []) {
            if (!sources.includes(source))
                sources.push(source);
        }
    }
    return sources;
}
/**
 * 该作物可触发的变异效果。
 * 官方没有下发「组 → 具体效果」的映射，因此按效果自身的适用范围给：
 * - tag 为空/「无」的常规变异对所有作物生效；
 * - 「藏品」变异只在变异组允许藏品变异时列出；
 * - 「装扮」变异只对装扮果实列出；
 * - 「活动」变异依附具体活动，不在这里兜底，避免虚报。
 */
function getMutationEffectsForSeed(plant) {
    const sources = getMutationSources(plant);
    const illustratedType = getIllustratedTypeByParam(Number(plant.fruit && plant.fruit.id) || 0);
    const allowCollection = sources.includes('藏品变异');
    const allowDecoration = illustratedType === '装扮果实';
    const effects = [];
    for (const effect of mutantEffectMap.values()) {
        const tag = String(effect && effect.tag || '').trim();
        const isDecoration = tag === '装扮';
        const isActivity = tag === '活动';
        const isCollection = tag === '藏品';
        if (isActivity)
            continue;
        if (isDecoration && !allowDecoration)
            continue;
        if (isCollection && !allowCollection)
            continue;
        if (effect && effect.hide_ui)
            continue;
        const probabilities = mutantPublicityMap.get(Number(effect.id)) || [];
        const percent = probabilities.length
            ? Math.max(...probabilities.map(entry => Number(entry.percent) || 0))
            : null;
        const dto = toMutantEffectDto(effect, Number(effect.id));
        effects.push({
            id: dto.id,
            name: dto.name,
            icon: dto.icon,
            description: dto.description,
            tag,
            probabilityPercent: percent,
        });
    }
    return effects.sort((a, b) => (b.probabilityPercent || 0) - (a.probabilityPercent || 0) || a.id - b.id);
}
/**
 * 查询作物在指定生长阶段的官方贴图（plant_images/Crop_<编号>/<阶段>.png）。
 * manifest 键用官方资源编号：普通作物 = 协议作物ID - 1020000（1020084 → Crop_84，
 * 1029004 → Crop_9004），同时兼容直接用完整作物 ID 做键的清单。
 * 阶段 1-6（种子/发芽/小叶/大叶/开花/成熟）；缺失精确阶段时回退到不大于目标的
 * 最近贴图，连最低阶段都比目标大时回退最小可用阶段，避免出现空图。
 */
function getPlantPhaseImage(plantId, phase) {
    const id = Number(plantId) || 0;
    if (!Number.isSafeInteger(id) || id <= 0)
        return '';
    const candidates = id >= 1020000 ? [id - 1020000, id] : [id];
    for (const candidate of candidates) {
        const phaseMap = plantPhaseImageMap.get(candidate);
        if (!phaseMap || phaseMap.size === 0)
            continue;
        const target = Number(phase) || 0;
        if (!Number.isInteger(target) || target <= 0)
            return '';
        const exact = phaseMap.get(Math.min(target, 6));
        if (exact)
            return exact;
        let fallback = '';
        let fallbackPhase = 0;
        let smallest = '';
        let smallestPhase = Number.MAX_SAFE_INTEGER;
        for (const [candidatePhase, url] of phaseMap) {
            if (candidatePhase <= target && candidatePhase > fallbackPhase) {
                fallback = url;
                fallbackPhase = candidatePhase;
            }
            if (candidatePhase < smallestPhase) {
                smallest = url;
                smallestPhase = candidatePhase;
            }
        }
        return fallback || smallest;
    }
    return '';
}
function getAllSeeds() {
    const seeds = [];
    for (const p of seedToPlant.values()) {
        // 无效植物（白萝卜 29999 等）不进出种子列表：种不出来也买不到。
        if (!p.seed_id || isInvalidPlant(p))
            continue;
        seeds.push({
            seedId: p.seed_id,
            name: p.name,
            requiredLevel: (() => { const si = seedItemMap.get(p.seed_id); return si ? (Number(si.level) || 0) : (Number(p.land_level_need) || 0); })(),
            price: getSeedPrice(p.seed_id),
            image: getSeedImageBySeedId(p.seed_id),
            seasons: Number(p.seasons) || 1,
            exp: Number(p.exp) || 0,
            growPhases: p.grow_phases || '',
            growTime: getPlantGrowTime(p.id),
            size: Number(p.size) || 0,
            harvestCount: Number(p.fruit && p.fruit.count) || 0,
            mutationGroupIds: parseMutationGroupIds(p.mutant_group_ids),
            mutationSources: getMutationSources(p),
            mutationEffects: getMutationEffectsForSeed(p),
        });
    }
    return seeds.sort((a, b) => a.seedId - b.seedId);
}
function getMappedSeedImage(targetId) {
    return getItemImageById(targetId);
}
function getSeedImageBySeedId(seedId) {
    return getMappedSeedImage(seedId);
}
function getItemImageById(itemId) {
    const id = Number(itemId);
    if (!Number.isSafeInteger(id) || id <= 0)
        return '';
    let imageId = itemImageIds.has(id) ? id : 0;
    const item = itemInfoMap.get(id);
    if (!imageId && item) {
        // 复用配置明确指向的同一图标；解锁卡也可使用其对应作物的模型图。
        imageId = iconImageIds.get(getItemImageKey(item, 'icon_res'))
            || assetImageIds.get(getItemImageKey(item, 'asset_name')) || 0;
        if (!imageId) {
            // 物品图标文件缺失时，按 asset_name 的 Crop_<编号> 回退到阶段贴图
            //（果实/变异果实用成熟阶段，种子用种子阶段）；目录缺失时返回空串走占位图。
            const cropKey = /(?:^|\/)Crop_(\d+)$/.exec(getItemImageKey(item, 'asset_name').split(':').pop() || '');
            if (cropKey) {
                const phase = Number(item.type) === 5 ? 1 : 6;
                const phaseImage = getPlantPhaseImage(Number(cropKey[1]), phase);
                if (phaseImage)
                    return phaseImage;
            }
        }
    }
    return imageId ? `/game-config/seed_images_named/seed_images/${imageId}.png` : '';
}
function getItemById(itemId) {
    return itemInfoMap.get(Number(itemId) || 0);
}
function getShopGoodsById(goodsId) {
    return shopGoodsMap.get(goodsId);
}
/**
 * 解析 sells 字段，格式为 "货币ID:价格" 或 "货币ID1:价格1;货币ID2:价格2"
 * 返回 [{ currencyId, price }, ...]
 */
function parseSells(sells) {
    if (!sells)
        return [];
    return sells.split(';').map(part => {
        const [cid, price] = part.split(':');
        return { currencyId: Number(cid) || 0, price: Number(price) || 0 };
    });
}
/** Resolve prices whose normal or explicitly confirmed conditional sale is available. */
function getEffectiveSellInfo(itemOrId, context) {
    const item = typeof itemOrId === 'number'
        ? getItemById(itemOrId)
        : (itemOrId || undefined);
    if (!item)
        return { sellable: false, status: 'unavailable', condition: null, sells: [] };
    const normalSells = parseSells(item.sells).filter(sell => sell.currencyId > 0 && sell.price > 0);
    const condition = item.sell_cond ? String(item.sell_cond).trim() : '';
    const conditionalSells = parseSells(item.cond_sells).filter(sell => sell.currencyId > 0 && sell.price > 0);
    if (condition && conditionalSells.length > 0 && context
        && isSellConditionSatisfied(condition, context)) {
        return { sellable: true, status: 'available', condition, sells: conditionalSells };
    }
    if (normalSells.length > 0) {
        return { sellable: true, status: 'available', condition: condition || null, sells: normalSells };
    }
    if (condition && conditionalSells.length > 0) {
        return { sellable: false, status: 'conditional', condition, sells: [] };
    }
    return { sellable: false, status: 'unavailable', condition: condition || null, sells: [] };
}
function getSeedPrice(seedId) {
    const item = seedItemMap.get(Number(seedId) || 0);
    if (!item)
        return 0;
    const sellsList = parseSells(item.sells);
    if (sellsList.length > 0)
        return sellsList[0].price;
    // 回退到 cond_sells（活动道具可能 sells 为 null）
    const condList = parseSells(item.cond_sells);
    return condList.length > 0 ? condList[0].price : 0;
}
function getFruitPrice(fruitId) {
    const item = itemInfoMap.get(Number(fruitId) || 0);
    if (!item)
        return 0;
    const sellsList = parseSells(item.sells);
    if (sellsList.length > 0)
        return sellsList[0].price;
    const condList = parseSells(item.cond_sells);
    return condList.length > 0 ? condList[0].price : 0;
}
function getAllPlants() {
    return filterInvalidPlants(Array.from(plantMap.values()));
}
function getAllFruits() {
    return Array.from(itemInfoMap.values()).filter(item => Number(item.type) === 6);
}
function getAllItems() {
    // 返回所有非种子(type=5)、非果实(type=6)的道具
    return Array.from(itemInfoMap.values()).filter(item => {
        const t = Number(item.type);
        return t !== 5 && t !== 6;
    });
}
function getItemsByType(type) {
    return Array.from(itemInfoMap.values()).filter(item => Number(item.type) === type);
}
function getItemInfoMap() {
    return itemInfoMap;
}
function getPlantMap() {
    return plantMap;
}
function getLandConfigById(landId) {
    return landConfigMap.get(Number(landId) || 0);
}
function getLandConfigByCoordinate(gridX, gridY) {
    if (!Number.isInteger(gridX) || !Number.isInteger(gridY))
        return undefined;
    return landCoordinateMap.get(getLandCoordinateKey(gridX, gridY));
}
function getAllLandConfigs() {
    return Array.from(landConfigMap.values());
}
function normalizeMutantIconName(value) {
    const raw = String(value || '').trim().replace(/\/spriteFrame$/i, '');
    return raw.split('/').filter(Boolean).pop() || '';
}
function toMutantEffectDto(effect, id) {
    const numericId = Number(id) || Number(effect?.id) || 0;
    if (!effect) {
        return {
            id: numericId,
            name: numericId > 0 ? `变异 #${numericId}` : '变异',
            icon: '',
            description: '',
            tag: '',
            activityId: 0,
        };
    }
    return {
        id: numericId,
        // 土地效果以官方运行时配置的 effect_name 为准；name 可能是“喜鹊事件”等内部事件名。
        name: String(effect.effect_name || effect.name || (numericId > 0 ? `变异 #${numericId}` : '变异')),
        icon: normalizeMutantIconName(effect.icon),
        description: String(effect.description
            || effect.tips
            || MUTANT_EFFECT_DESCRIPTION_FALLBACKS.get(numericId)
            || ''),
        tag: String(effect.tag || ''),
        activityId: Number(effect.activity_id) || 0,
    };
}
function getMutantEffectById(mutantId) {
    const id = Number(mutantId) || 0;
    if (id <= 0)
        return undefined;
    const effect = mutantEffectMap.get(id);
    return effect ? toMutantEffectDto(effect, id) : undefined;
}
function getMutantEffectsByIds(ids) {
    if (!Array.isArray(ids))
        return [];
    const seen = new Set();
    const result = [];
    for (const raw of ids) {
        const id = Number(raw) || 0;
        if (id <= 0 || seen.has(id))
            continue;
        seen.add(id);
        result.push(toMutantEffectDto(mutantEffectMap.get(id), id));
    }
    return result;
}
function getMutantTypeNames(ids) {
    return getMutantEffectsByIds(ids).map(effect => effect.name);
}
function getIllustratedTypeByParam(param) {
    const entry = illustratedItemMap.get(Number(param) || 0);
    return String(entry && entry.type || '');
}
function getIllustratedSortByParam(param) {
    const entry = illustratedItemMap.get(Number(param) || 0);
    return Number(entry && entry.sort) || 0;
}
function illustratedBuffDto(entry) {
    const value = Number(entry.attr_value) || 0;
    return {
        id: Number(entry.id) || 0,
        level: Number(entry.source_param) || 0,
        name: String(entry.attr_id || ''),
        value,
        valueType: value > 10 ? 'probability' : 'quantity',
    };
}
function getIllustratedBuffsByLevel(level) {
    const maxLevel = Math.max(0, Number(level) || 0);
    const latestByAttribute = new Map();
    [...buffConfigMap.values()]
        .filter(entry => entry.source_type === '超变升级' && Number(entry.source_param) <= maxLevel)
        .sort((a, b) => Number(a.source_param) - Number(b.source_param))
        .forEach(entry => {
        const name = String(entry.attr_id || '');
        if (name)
            latestByAttribute.set(name, illustratedBuffDto(entry));
    });
    return [...latestByAttribute.values()].sort((a, b) => a.level - b.level);
}
function getIllustratedBuffs() {
    return [...buffConfigMap.values()]
        .filter(entry => entry.source_type === '超变升级')
        .sort((a, b) => Number(a.source_param) - Number(b.source_param))
        .map(illustratedBuffDto);
}
/**
 * 根据当前变异组合解析客户端应展示的植物 ID。
 * mutant_effect_plant 格式示例：5:1120112:1;5_6:1129001:1。
 * 多效果组合优先于单效果，避免黄金+活动变异退化成普通黄金作物。
 */
function getMutantDisplayPlantId(plantId, mutantIds) {
    const numericPlantId = Number(plantId) || 0;
    if (!Array.isArray(mutantIds) || mutantIds.length === 0)
        return numericPlantId;
    const activeIds = new Set(mutantIds.map(id => Number(id) || 0).filter(id => id > 0));
    let currentPlantId = numericPlantId;
    const visited = new Set([currentPlantId]);
    for (let depth = 0; depth < 4; depth += 1) {
        const plant = plantMap.get(currentPlantId);
        const mapping = String(plant && plant.mutant_effect_plant || '').trim();
        if (!mapping)
            break;
        let bestMatch = null;
        for (const entry of mapping.split(';')) {
            const [effectKey, targetIdText] = entry.split(':');
            const effectIds = String(effectKey || '')
                .split('_')
                .map(id => Number(id) || 0)
                .filter(id => id > 0);
            const targetId = Number(targetIdText) || 0;
            if (!targetId || effectIds.length === 0 || !effectIds.every(id => activeIds.has(id)))
                continue;
            if (!bestMatch || effectIds.length > bestMatch.effectCount) {
                bestMatch = { effectCount: effectIds.length, targetId };
            }
        }
        if (!bestMatch || visited.has(bestMatch.targetId))
            break;
        currentPlantId = bestMatch.targetId;
        visited.add(currentPlantId);
    }
    return currentPlantId;
}
// 启动时加载配置
loadConfigs();
module.exports = {
    loadConfigs,
    getAllPlants,
    getAllSeeds,
    // 等级经验
    getLevelExpTable,
    getLevelExpProgress,
    // 植物配置
    getPlantById,
    getPlantBySeedId,
    getPlantName,
    getPlantNameBySeedId,
    getPlantGrowTime,
    getPlantGrowPhases,
    getPlantPhaseImage,
    getPlantExp,
    formatGrowTime,
    // 果实配置
    getFruitName,
    getPlantByFruitId,
    getItemById,
    getShopGoodsById,
    getItemImageById,
    getSeedPrice,
    getFruitPrice,
    parseSells,
    getEffectiveSellInfo,
    getSeedImageBySeedId,
    // 配置管理查询
    getAllFruits,
    getAllItems,
    getItemsByType,
    getItemInfoMap,
    getPlantMap,
    getLandConfigById,
    getLandConfigByCoordinate,
    getAllLandConfigs,
    getMutantEffectById,
    getMutantEffectsByIds,
    getMutantTypeNames,
    isInvalidSeedId,
    isInvalidPlant,
    filterInvalidPlants,
    getIllustratedTypeByParam,
    getIllustratedSortByParam,
    getIllustratedBuffsByLevel,
    getIllustratedBuffs,
    getMutantDisplayPlantId,
};
//# sourceMappingURL=gameConfig.js.map