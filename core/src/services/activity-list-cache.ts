export {};

type ActivityListLoader<T> = (loadId: number) => Promise<T>;
type Clock = () => number;
type ActivityListAccessSource = 'network' | 'pending' | 'cache';

interface ActivityListAccess {
    source: ActivityListAccessSource;
    loadId: number;
    ageMs: number;
}

type ActivityListAccessObserver = (access: ActivityListAccess) => void;

function createActivityListCache<T>(loader: ActivityListLoader<T>, clock: Clock = Date.now) {
    let cached: T | null = null;
    let loadedAt = 0;
    let cachedLoadId = 0;
    let pending: { promise: Promise<T>; loadId: number; startedAt: number } | null = null;
    let invalidationRevision = 0;
    let nextLoadId = 1;

    function reportAccess(observer: ActivityListAccessObserver | undefined, access: ActivityListAccess): void {
        if (!observer) return;
        try {
            observer(access);
        } catch {
            // Diagnostics must never affect the activity request.
        }
    }

    async function get(maxAgeMs = 0, observer?: ActivityListAccessObserver): Promise<T> {
        const reuseWindowMs = Math.max(0, Number(maxAgeMs) || 0);
        const now = clock();
        if (cached !== null && reuseWindowMs > 0 && now - loadedAt <= reuseWindowMs) {
            reportAccess(observer, {
                source: 'cache',
                loadId: cachedLoadId,
                ageMs: Math.max(0, now - loadedAt),
            });
            return cached;
        }
        if (pending) {
            reportAccess(observer, {
                source: 'pending',
                loadId: pending.loadId,
                ageMs: Math.max(0, now - pending.startedAt),
            });
            return pending.promise;
        }

        const loadId = nextLoadId++;
        const startedAt = now;
        const loadRevision = invalidationRevision;
        let request: Promise<T>;
        try {
            request = Promise.resolve(loader(loadId));
        } catch (error) {
            request = Promise.reject(error);
        }
        const pendingRequest = { promise: request, loadId, startedAt };
        pending = pendingRequest;
        reportAccess(observer, { source: 'network', loadId, ageMs: 0 });
        try {
            const value = await request;
            if (loadRevision === invalidationRevision) {
                cached = value;
                loadedAt = clock();
                cachedLoadId = loadId;
            }
            return value;
        } finally {
            if (pending === pendingRequest) pending = null;
        }
    }

    function invalidate(): void {
        invalidationRevision += 1;
        cached = null;
        loadedAt = 0;
        cachedLoadId = 0;
    }

    return { get, invalidate };
}

module.exports = { createActivityListCache };
