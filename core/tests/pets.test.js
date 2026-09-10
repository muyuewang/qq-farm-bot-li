const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPetSnapshot } = require('../dist/services/pets');

test('pet food inventory uses the same 90004 item id granted by dog-skill gift packages', () => {
    const snapshot = buildPetSnapshot({
        current_dog_id: 90011,
        protect_time: 17 * 60 * 60,
        max_protect_time: 30 * 24 * 60 * 60,
        items: [
            { id: 90004, duration: 24 * 60 * 60 },
            { id: 90005, duration: 3 * 24 * 60 * 60 },
            { id: 90006, duration: 5 * 24 * 60 * 60 },
        ],
    }, {
        item_bag: {
            items: [{ id: 90004, count: 1 }],
        },
    });

    const oneDayFood = snapshot.foods.find(food => food.id === 90004);
    assert.equal(oneDayFood.name, '1天狗粮');
    assert.equal(oneDayFood.count, 1);
    assert.equal(oneDayFood.duration, 24 * 60 * 60);
    assert.equal(snapshot.protectDuration, 17 * 60 * 60);
    assert.equal(snapshot.maxProtectDuration, 30 * 24 * 60 * 60);
});
