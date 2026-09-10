const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildActivityGameplayBindings,
    resolveActivityGameplays,
} = require('../dist/services/activity-gameplay-registry');

test('activity manifests keep existing activity IDs mapped after expiry', () => {
    const bindings = buildActivityGameplayBindings({});

    assert.deepEqual(resolveActivityGameplays(['2026081800'], bindings), {
        gameplayKey: 'qixi',
        gameplayKeys: ['qixi'],
        detailTarget: 'qixi',
        gameplayTargets: ['qixi'],
    });
    assert.deepEqual(resolveActivityGameplays(['2026070304'], bindings), {
        gameplayKey: 'weather',
        gameplayKeys: ['weather'],
        detailTarget: 'weather',
        gameplayTargets: ['weather'],
    });
    assert.deepEqual(resolveActivityGameplays(['2026090901'], bindings), {
        gameplayKey: 'charity',
        gameplayKeys: ['charity'],
        detailTarget: 'charity',
        gameplayTargets: ['charity'],
    });
});

test('server-discovered IDs extend manifest bindings without changing dispatch code', () => {
    const bindings = buildActivityGameplayBindings({
        constellation: { activityId: '90001' },
        qingMei: { activityId: '90002' },
        charity: { groupId: '90003', activityId: '90004' },
    });

    assert.equal(resolveActivityGameplays(['90001'], bindings).detailTarget, 'constellation');
    assert.equal(resolveActivityGameplays(['90002'], bindings).detailTarget, 'qingmei');
    assert.equal(resolveActivityGameplays(['90003'], bindings).detailTarget, 'charity');
    assert.equal(resolveActivityGameplays(['90004'], bindings).detailTarget, 'charity');
    assert.equal(resolveActivityGameplays(['99999'], bindings).detailTarget, null);
});
