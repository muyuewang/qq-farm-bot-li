const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLandUpgradeDetail } = require('../dist/services/farm/land-upgrade');

test('land 21 keeps the exact server level and currency conditions and compares gold to crystal bonuses', () => {
    const info = buildLandUpgradeDetail({ id: 21, unlocked: true, level: 4, max_level: 5,
        buff: { plant_yield_bonus: 30000, planting_time_reduction: 2000, plant_exp_bonus: 2000 },
        upgrade_condition: { level_need: 150, preceeding_lands_count_need: 2,
            items_need: [{ id: 1001, count: '450000000' }, { id: 1005, count: '18670' }] } },
        new Map([[21, { unlocked: true, level: 4 }]]));
    assert.equal(info.needLevel, 150);
    assert.deepEqual(info.costs.map(c => [c.id, c.count]), [['1001', '450000000'], ['1005', '18670']]);
    assert.equal(info.current.expBonus, 20);
    assert.equal(info.next.expBonus, 25);
    assert.equal(info.next.mutantMultiplier, 1.2);
    assert.equal(info.next.resonanceBonus, 25);
    assert.equal(info.unknown, false);
});

test('max level does not show upgrade costs; server bonuses override static defaults', () => {
    const info = buildLandUpgradeDetail({ unlocked: true, level: 5, max_level: 5, buff: { plant_exp_bonus: 5000 } });
    assert.equal(info.mode, 'max');
    assert.equal(info.current.expBonus, 50);
    assert.equal(info.next, null);
    assert.deepEqual(info.costs, []);
});

test('unlocking shows prerequisite land and exact price instead of upgrade requirements', () => {
    const raw = { id: 8, unlocked: false, unlock_condition: { preceding_land_id: 7, need_level: 10, need_gold: 100000 } };
    const info = buildLandUpgradeDetail(raw, new Map([[7, { unlocked: true }]]));
    assert.equal(info.mode, 'unlock');
    assert.equal(info.needLevel, 10);
    assert.equal(info.prerequisite.met, true);
    assert.equal(info.costs[0].count, '100000');
    assert.equal(buildLandUpgradeDetail(raw).prerequisite.met, false);
});

// 上游 PR #116 按官方抓包删掉了 LandUpgradeCondition.condition_type，改成直接读 level_need / items_need，
// 所以「无法解读」不再是未知类型码，而是 level_need 缺失；缺失时 number() 兜底成 0（不是 null），
// 真正让界面别当许可用的是 unknown 标志。needLevel=0 是上游现状，不是官方对拍结论。
test('a server condition without level_need stays unknown; known official fallback does not imply upgrade permission', () => {
    const info = buildLandUpgradeDetail({ id: 21, unlocked: true, level: 4, max_level: 5,
        upgrade_condition: { items_need: [{ id: 1001, count: '450000000' }] } },
        new Map([[21, { unlocked: true, level: 4 }]]));
    assert.equal(info.unknown, true);
    assert.equal(info.needLevel, 0);
    const fallback = buildLandUpgradeDetail({ id: 21, unlocked: true, level: 4, max_level: 5 });
    assert.equal(fallback.needLevel, 150);
    assert.equal(fallback.serverAllowed, false);
    assert.equal(fallback.costs[1].count, '18670');
});
