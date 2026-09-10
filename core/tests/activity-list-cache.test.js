const assert = require('node:assert/strict');
const test = require('node:test');

const { createActivityListCache } = require('../dist/services/activity-list-cache');

test('activity list cache reuses a recent reply and refreshes after the reuse window', async () => {
    let now = 1000;
    let calls = 0;
    const cache = createActivityListCache(async () => ({ sequence: ++calls }), () => now);

    const first = await cache.get(0);
    now += 500;
    const reused = await cache.get(1000);
    now += 1000;
    const refreshed = await cache.get(1000);

    assert.equal(first.sequence, 1);
    assert.equal(reused, first);
    assert.equal(refreshed.sequence, 2);
    assert.equal(calls, 2);
});

test('activity list cache coalesces concurrent gateway requests', async () => {
    let resolveLoad;
    let calls = 0;
    const cache = createActivityListCache(() => {
        calls += 1;
        return new Promise(resolve => {
            resolveLoad = resolve;
        });
    });

    const first = cache.get(0);
    const second = cache.get(0);
    resolveLoad({ activities: ['charity'] });

    assert.equal(await first, await second);
    assert.equal(calls, 1);
});

test('activity list cache reports whether a reply came from network, pending work, or cache', async () => {
    let resolveLoad;
    const accesses = [];
    const cache = createActivityListCache(() => new Promise(resolve => {
        resolveLoad = resolve;
    }));

    const first = cache.get(0, access => accesses.push({ caller: 'directory', ...access }));
    const second = cache.get(30_000, access => accesses.push({ caller: 'charity-pending', ...access }));
    resolveLoad({ activities: ['charity'] });
    await Promise.all([first, second]);
    await cache.get(30_000, access => accesses.push({ caller: 'charity-cached', ...access }));

    assert.deepEqual(accesses.map(({ caller, source, loadId }) => ({ caller, source, loadId })), [
        { caller: 'directory', source: 'network', loadId: 1 },
        { caller: 'charity-pending', source: 'pending', loadId: 1 },
        { caller: 'charity-cached', source: 'cache', loadId: 1 },
    ]);
});

test('activity list cache invalidation prevents stale state reuse', async () => {
    let calls = 0;
    const cache = createActivityListCache(async () => ({ sequence: ++calls }));

    const first = await cache.get(0);
    cache.invalidate();
    const second = await cache.get(60_000);

    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(calls, 2);
});

test('activity list cache does not retain a reply invalidated while its request is pending', async () => {
    let resolveFirst;
    let calls = 0;
    const cache = createActivityListCache(() => {
        calls += 1;
        if (calls === 1) {
            return new Promise(resolve => {
                resolveFirst = resolve;
            });
        }
        return Promise.resolve({ sequence: calls });
    });

    const first = cache.get(0);
    cache.invalidate();
    resolveFirst({ sequence: 1 });
    assert.deepEqual(await first, { sequence: 1 });
    assert.deepEqual(await cache.get(60_000), { sequence: 2 });
    assert.equal(calls, 2);
});

test('activity list cache does not retain rejected requests', async () => {
    let calls = 0;
    const cache = createActivityListCache(async () => {
        calls += 1;
        if (calls === 1) throw new Error('temporary failure');
        return { sequence: calls };
    });

    await assert.rejects(cache.get(0), /temporary failure/);
    assert.deepEqual(await cache.get(60_000), { sequence: 2 });
});
