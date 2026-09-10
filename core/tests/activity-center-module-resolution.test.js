const assert = require('node:assert/strict');
const test = require('node:test');

test('the legacy activity-center module path forwards to the directory barrel', () => {
    const activity = require('../dist/services/activity-center');

    assert.equal(typeof activity.getActivityDirectorySnapshot, 'function');
    assert.equal(typeof activity.getCurrentCharityRedFlowerActivity, 'function');
    assert.equal(typeof activity.acceptCharityRedFlowerAgreement, 'function');
    for (const name of ['getPetDiary', 'operatePetDiary', 'getPetDiaryRecords', 'getPetDiaryFriend']) {
        assert.equal(typeof activity[name], 'function', name);
    }
});
