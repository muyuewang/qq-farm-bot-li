const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

process.env.FARM_DATA_DIR = path.resolve(__dirname, '..', 'data');

const gameConfig = require('../dist/config/gameConfig');

gameConfig.loadConfigs();
const seeds = gameConfig.getAllSeeds();
const bySeedId = new Map(seeds.map(seed => [seed.seedId, seed]));

test('invalid plants stay out of the seed catalog', () => {
    // 白萝卜 seed 29999 在官方 ItemInfo 里有、商店不卖，属于无效种子。
    assert.equal(bySeedId.has(29999), false);
    assert.equal(gameConfig.isInvalidSeedId(29999), true);
    assert.equal(gameConfig.getItemById(29999), undefined);
    // 但植物资料仍保留，地里已种下的白萝卜才能解析生长阶段。
    assert.ok(gameConfig.getPlantById(2020002));
});

test('event plant sheet fills seeds missing from the full table', () => {
    const hydrangea = bySeedId.get(20207);
    assert.ok(hydrangea, '绣球花种子应来自 EventPlants.json');
    assert.equal(hydrangea.name, '绣球花');
    assert.equal(gameConfig.getPlantBySeedId(20207).fruit.id, 40207);
    assert.equal(gameConfig.getFruitName(40207), '绣球花');
});

test('every seed carries growth timing and mutation metadata', () => {
    for (const seed of seeds) {
        assert.ok(Number.isInteger(seed.seedId) && seed.seedId > 0);
        assert.ok(Array.isArray(seed.mutationGroupIds));
        assert.ok(Array.isArray(seed.mutationSources));
        assert.ok(Array.isArray(seed.mutationEffects));
        // 绣球花是官方只下发了 id/name 的增量条目，允许缺生长数据。
        if (seed.seedId !== 20207) {
            assert.ok(seed.growTime > 0, `${seed.name} 应有生长时间`);
            assert.ok(seed.image, `${seed.name} 应有种子图`);
        }
    }
});

test('common crops expose the mutation pool with public probabilities', () => {
    const wheat = seeds.find(seed => seed.name === '小麦');
    assert.ok(wheat);
    assert.ok(wheat.mutationGroupIds.length > 0);
    assert.ok(wheat.mutationSources.includes('自然变异'));
    assert.ok(wheat.mutationEffects.length > 0);
    const golden = wheat.mutationEffects.find(effect => effect.name === '黄金');
    assert.ok(golden && golden.probabilityPercent > 0);
    // 活动变异依附具体活动，不在通用池里虚报。
    assert.equal(wheat.mutationEffects.some(effect => effect.tag === '活动'), false);
});

test('plant phase sprites resolve for normal and multi-digit crop ids', () => {
    assert.match(gameConfig.getPlantPhaseImage(1020084, 1), /^\/game-config\/plant_images\/Crop_\d+\/1\.png$/);
    assert.match(gameConfig.getPlantPhaseImage(1020084, 6), /\/6\.png$/);
    // 缺失精确阶段时回退到不大于目标的最近贴图，而不是空串。
    assert.ok(gameConfig.getPlantPhaseImage(1029004, 3));
    assert.equal(gameConfig.getPlantPhaseImage(0, 1), '');
});
