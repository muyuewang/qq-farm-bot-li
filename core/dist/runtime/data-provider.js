"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { findAccountByRef, normalizeAccountRef, resolveAccountId: resolveAccountIdByList } = require('../services/account-resolver');
const { getSchedulerRegistrySnapshot } = require('../services/scheduler');
const { getAccountRuntimeState, setAccountRuntimeState } = require('../services/account-runtime-state');
function createDataProvider(options) {
    const { workers, globalLogs, accountLogs, store, getAccounts, callWorkerApi, buildDefaultStatus, normalizeStatusForPanel, filterLogs, addAccountLog, nextConfigRevision, broadcastConfigToWorkers, buildConfigSnapshotForAccount, broadcastGameConfigReload: broadcastGameConfigReloadOpt, startWorker, stopWorker, restartWorker, cancelPendingRelogin, } = options;
    /**
     * 用户手动「停止」/「启动」/「重启」都是明确的人工意图，必须让自动重登让位：
     * 等待期内账号没有子进程，`stopWorker` 停不掉这条定时器，到点会把它重新拉起，
     * 用户看到的就是「点了停止却自己启动了」。
     */
    function cancelPendingReloginSafe(accountId) {
        if (!accountId || typeof cancelPendingRelogin !== 'function')
            return;
        try {
            cancelPendingRelogin(accountId);
        }
        catch {
            // 撤销失败不能影响停止 / 启动流程本身
        }
    }
    function getStoredAccountsList() {
        const data = getAccounts();
        return Array.isArray(data.accounts) ? data.accounts : [];
    }
    function resolveAccountRefId(accountRef) {
        const raw = normalizeAccountRef(accountRef);
        if (!raw)
            return '';
        const resolved = resolveAccountIdByList(getStoredAccountsList(), raw);
        return resolved || raw;
    }
    function findAccountByAnyRef(accountRef) {
        return findAccountByRef(getStoredAccountsList(), accountRef);
    }
    return {
        resolveAccountId: (accountRef) => resolveAccountRefId(accountRef),
        getStatus: (accountRef) => {
            const accountId = resolveAccountRefId(accountRef);
            if (!accountId)
                return buildDefaultStatus('');
            const w = workers[accountId];
            if (!w || !w.status)
                return buildDefaultStatus(accountId);
            return {
                ...buildDefaultStatus(accountId),
                ...normalizeStatusForPanel(w.status, accountId, w.name),
                wsError: w.wsError || null,
            };
        },
        getLogs: (accountRef, optionsOrLimit) => {
            const opts = (typeof optionsOrLimit === 'object' && optionsOrLimit) ? optionsOrLimit : { limit: optionsOrLimit };
            const max = Math.max(1, Number(opts.limit) || 100);
            const rawRef = normalizeAccountRef(accountRef);
            const accountId = resolveAccountRefId(accountRef);
            if (!rawRef || rawRef === 'all') {
                return filterLogs(globalLogs, opts).slice(-max);
            }
            if (!accountId)
                return [];
            const accId = String(accountId || '');
            return filterLogs(globalLogs.filter(l => String(l.accountId || '') === accId), opts).slice(-max);
        },
        getAccountLogs: (limit) => accountLogs.slice(-limit).reverse(),
        addAccountLog: (action, msg, accountId, accountName, extra) => addAccountLog(action, msg, accountId, accountName, extra),
        clearLogs: (accountRef) => {
            const rawRef = normalizeAccountRef(accountRef);
            const accountId = resolveAccountRefId(accountRef);
            if (!rawRef || rawRef === 'all') {
                globalLogs.length = 0;
                return { cleared: 'all' };
            }
            if (!accountId)
                return { cleared: 0 };
            const accId = String(accountId || '');
            const before = globalLogs.length;
            for (let i = globalLogs.length - 1; i >= 0; i--) {
                if (String(globalLogs[i].accountId || '') === accId) {
                    globalLogs.splice(i, 1);
                }
            }
            const after = globalLogs.length;
            return { cleared: before - after, accountId };
        },
        getLands: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getLands', true),
        getIllustratedSnapshot: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getIllustratedSnapshot'),
        getCollectionsSnapshot: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCollectionsSnapshot'),
        operateCollections: (accountRef, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateCollections', action, input),
        getRanchState: (accountRef, view, shopId, hostGid) => callWorkerApi(resolveAccountRefId(accountRef), 'getRanchState', view, shopId, hostGid),
        clearRanchIllustratedNew: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'clearRanchIllustratedNew'),
        prepareRanchAction: (accountRef, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'prepareRanchAction', action, input),
        operateRanch: (accountRef, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateRanch', action, input),
        claimIllustratedRewards: (accountRef, type) => callWorkerApi(resolveAccountRefId(accountRef), 'claimIllustratedRewards', type),
        clearIllustratedNew: (accountRef, fruitIds) => callWorkerApi(resolveAccountRefId(accountRef), 'clearIllustratedNew', fruitIds),
        getSolarCalendar: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getSolarCalendar'),
        operateSolarCalendar: (accountRef, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateSolarCalendar', action, input),
        getFriends: (accountRef, forceSync = false) => callWorkerApi(resolveAccountRefId(accountRef), 'getFriends', forceSync, true),
        getFriendsCache: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getFriendsCache'),
        clearFriendsCache: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'clearFriendsCache'),
        getInteractRecords: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getInteractRecords'),
        getFriendLands: (accountRef, gid) => callWorkerApi(resolveAccountRefId(accountRef), 'getFriendLands', gid, true),
        getFriendInteractionItems: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'getFriendInteractionItems', true)),
        useFriendInteractionItemBatch: (accountRef, gid, itemId, landIds) => (callWorkerApi(resolveAccountRefId(accountRef), 'useFriendInteractionItemBatch', gid, itemId, landIds, true)),
        useFriendFarmInteractionItem: (accountRef, gid, itemId) => (callWorkerApi(resolveAccountRefId(accountRef), 'useFriendFarmInteractionItem', gid, itemId, true)),
        getSelfInteractionItems: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'getSelfInteractionItems', true)),
        useSelfInteractionItemBatch: (accountRef, itemId, landIds) => (callWorkerApi(resolveAccountRefId(accountRef), 'useSelfInteractionItemBatch', itemId, landIds, true)),
        doFriendOp: (accountRef, gid, opType) => callWorkerApi(resolveAccountRefId(accountRef), 'doFriendOp', gid, opType, true),
        delFriend: (accountRef, gid) => callWorkerApi(resolveAccountRefId(accountRef), 'delFriend', gid),
        getBag: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getBag'),
        getBagSeeds: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getBagSeeds'),
        getDiamondBalance: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getDiamondBalance'),
        useItem: (accountRef, itemId, count, uid = 0) => callWorkerApi(resolveAccountRefId(accountRef), 'useItem', itemId, count, uid),
        sellItems: (accountRef, items) => callWorkerApi(resolveAccountRefId(accountRef), 'sellItems', items),
        setItemsLocked: (accountRef, itemUids, locked) => (callWorkerApi(resolveAccountRefId(accountRef), 'setItemsLocked', itemUids, locked)),
        getDogSkillGiftStatus: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'getDogSkillGiftStatus')),
        claimDogSkillGifts: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'claimDogSkillGifts')),
        getPetInfo: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'getPetInfo')),
        activateDog: (accountRef, dogId) => (callWorkerApi(resolveAccountRefId(accountRef), 'activateDog', dogId)),
        deployDog: (accountRef, dogId) => (callWorkerApi(resolveAccountRefId(accountRef), 'deployDog', dogId)),
        withdrawDog: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'withdrawDog')),
        useDogFood: (accountRef, itemId, count = 1, uid = 0) => (callWorkerApi(resolveAccountRefId(accountRef), 'useDogFood', itemId, count, uid)),
        getPetProtectLogs: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'getPetProtectLogs')),
        getDailyGifts: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getDailyGiftOverview', true),
        getActivityDirectorySnapshot: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getActivityDirectorySnapshot'),
        getRanchActivityDirectorySnapshot: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getRanchActivityDirectorySnapshot'),
        getActivityCenterSnapshot: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getActivityCenterSnapshot'),
        getCurrentSeasonEvent: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentSeasonEvent'),
        getCurrentStellarActivity: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentStellarActivity'),
        getCurrentStarSandShop: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentStarSandShop'),
        getCurrentSolarTerms: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentSolarTerms'),
        getCurrentQixiActivity: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentQixiActivity'),
        getCurrentCharityRedFlowerActivity: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentCharityRedFlowerActivity'),
        getPetDiary: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getPetDiary'),
        operatePetDiary: (accountRef, action, params) => callWorkerApi(resolveAccountRefId(accountRef), 'operatePetDiary', action, params),
        getPetDiaryRecords: (accountRef, kind) => callWorkerApi(resolveAccountRefId(accountRef), 'getPetDiaryRecords', kind),
        getPetDiaryFriend: (accountRef, gid) => callWorkerApi(resolveAccountRefId(accountRef), 'getPetDiaryFriend', gid),
        claimCharityRedFlowerSeeds: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'claimCharityRedFlowerSeeds'),
        donateCharityRedFlowerLove: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'donateCharityRedFlowerLove'),
        claimCharityRedFlowerDailyGift: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'claimCharityRedFlowerDailyGift'),
        claimCharityRedFlowerProgressReward: (accountRef, target) => callWorkerApi(resolveAccountRefId(accountRef), 'claimCharityRedFlowerProgressReward', target),
        getCurrentWeatherActivity: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentWeatherActivity'),
        buyWeatherBottle: (accountRef, count) => callWorkerApi(resolveAccountRefId(accountRef), 'buyWeatherBottle', count),
        collectWeatherBottle: (accountRef, targetGid) => callWorkerApi(resolveAccountRefId(accountRef), 'collectWeatherBottle', targetGid),
        lightWeatherResearch: (accountRef, nodeId) => callWorkerApi(resolveAccountRefId(accountRef), 'lightWeatherResearch', nodeId),
        summonWeatherRain: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'summonWeatherRain'),
        claimBattlePassRewards: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'claimBattlePassRewards'),
        exchangeStarSandGoods: (accountRef, goodsId, count) => (callWorkerApi(resolveAccountRefId(accountRef), 'exchangeStarSandGoods', goodsId, count)),
        lightConstellation: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'lightConstellation'),
        claimSolarTerm: (accountRef, termId) => callWorkerApi(resolveAccountRefId(accountRef), 'claimSolarTerm', termId),
        getCurrentQingMeiActivity: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getCurrentQingMeiActivity'),
        claimQingMeiDailySeed: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'claimQingMeiDailySeed'),
        startQingMeiBrew: (accountRef, ingredients) => callWorkerApi(resolveAccountRefId(accountRef), 'startQingMeiBrew', ingredients),
        continueQingMeiBrew: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'continueQingMeiBrew'),
        settleQingMeiBrew: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'settleQingMeiBrew'),
        claimQixiBridgeRewards: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'claimQixiBridgeRewards'),
        giftQixiSachet: (accountRef, friendGid, messageTextId = 15) => (callWorkerApi(resolveAccountRefId(accountRef), 'giftQixiSachet', friendGid, messageTextId)),
        exchangeWeatherCollectorBottle: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'exchangeWeatherCollectorBottle')),
        getWeatherFriends: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'getWeatherFriends')),
        scanWeatherFriends: (accountRef, friendGids) => (callWorkerApi(resolveAccountRefId(accountRef), 'scanWeatherFriends', friendGids)),
        useWeatherCollectorBottle: (accountRef, friendGid) => (callWorkerApi(resolveAccountRefId(accountRef), 'useWeatherCollectorBottle', friendGid)),
        useWeatherSummonBottle: (accountRef) => (callWorkerApi(resolveAccountRefId(accountRef), 'useWeatherSummonBottle')),
        useWeatherFrogBottle: (accountRef, friendGid) => (callWorkerApi(resolveAccountRefId(accountRef), 'useWeatherFrogBottle', friendGid)),
        useWeatherCloudBottle: (accountRef, friendGid, landId) => (callWorkerApi(resolveAccountRefId(accountRef), 'useWeatherCloudBottle', friendGid, landId)),
        advanceWeatherResearch: (accountRef, nodeId) => (callWorkerApi(resolveAccountRefId(accountRef), 'advanceWeatherResearch', nodeId)),
        getMugeActivity: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getMugeActivity'),
        operateMugeActivity: (accountRef, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateMugeActivity', action, input),
        getMilkTeaActivity: (accountRef, page, input) => callWorkerApi(resolveAccountRefId(accountRef), 'getMilkTeaActivity', page, input),
        operateMilkTeaActivity: (accountRef, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateMilkTeaActivity', action, input),
        getShareRewardActivity: (accountRef, activityId) => callWorkerApi(resolveAccountRefId(accountRef), 'getShareRewardActivity', activityId),
        operateShareRewardActivity: (accountRef, activityId, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateShareRewardActivity', activityId, action, input),
        getAutumnActivity: (accountRef, key) => callWorkerApi(resolveAccountRefId(accountRef), 'getAutumnActivity', key),
        operateAutumnActivity: (accountRef, key, action, input) => callWorkerApi(resolveAccountRefId(accountRef), 'operateAutumnActivity', key, action, input),
        getPropsShop: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getPropsShop'),
        purchaseProps: (accountRef, goodsId, count, expectedOffer) => (callWorkerApi(resolveAccountRefId(accountRef), 'purchaseProps', goodsId, count, expectedOffer)),
        getMallCatalog: (accountRef, slotType, subSlotType) => (callWorkerApi(resolveAccountRefId(accountRef), 'getMallCatalog', slotType, subSlotType)),
        purchaseMallProduct: (accountRef, goodsId, count, slotType, expectedPrice) => (callWorkerApi(resolveAccountRefId(accountRef), 'purchaseMallProduct', goodsId, count, slotType, expectedPrice)),
        getMysteryShop: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getMysteryShop'),
        purchaseMysteryOffer: (accountRef, npcId) => (callWorkerApi(resolveAccountRefId(accountRef), 'purchaseMysteryOffer', npcId)),
        getSeeds: (accountRef) => callWorkerApi(resolveAccountRefId(accountRef), 'getSeeds', true),
        purchaseSeed: (accountRef, goodsId, count) => callWorkerApi(resolveAccountRefId(accountRef), 'purchaseSeed', goodsId, count),
        setAutomation: async (accountRef, key, value) => {
            const accountId = resolveAccountRefId(accountRef);
            if (!accountId) {
                throw new Error('Missing x-account-id');
            }
            store.setAutomation(key, value, accountId);
            const rev = nextConfigRevision();
            broadcastConfigToWorkers(accountId);
            return { automation: store.getAutomation(accountId), configRevision: rev };
        },
        doFarmOp: (accountRef, opType, targetLandId = null) => (callWorkerApi(resolveAccountRefId(accountRef), 'doFarmOp', opType, targetLandId, true)),
        fertilizeOwnLand: (accountRef, landId, fertilizerType) => (callWorkerApi(resolveAccountRefId(accountRef), 'fertilizeOwnLand', landId, fertilizerType)),
        fertilizeAllOwnLands: (accountRef, fertilizerType, landIds) => (callWorkerApi(resolveAccountRefId(accountRef), 'fertilizeAllOwnLands', fertilizerType, landIds)),
        doAnalytics: (accountRef, sortBy) => callWorkerApi(resolveAccountRefId(accountRef), 'getAnalytics', sortBy),
        buyFertilizer: (accountRef, type, count) => callWorkerApi(resolveAccountRefId(accountRef), 'buyFertilizer', type, count, true),
        checkAndBuyFertilizer: (accountRef, options) => callWorkerApi(resolveAccountRefId(accountRef), 'checkAndBuyFertilizer', options, true),
        saveSettings: async (accountRef, payload) => {
            const accountId = resolveAccountRefId(accountRef);
            if (!accountId) {
                throw new Error('Missing x-account-id');
            }
            const body = (payload && typeof payload === 'object') ? payload : {};
            const snapshot = {};
            const copyIfPresent = (sourceKey, targetKey = sourceKey) => {
                if (Object.hasOwn(body, sourceKey)) {
                    snapshot[targetKey] = body[sourceKey];
                }
            };
            copyIfPresent('plantingStrategy');
            if (!Object.hasOwn(snapshot, 'plantingStrategy'))
                copyIfPresent('strategy', 'plantingStrategy');
            copyIfPresent('preferredSeedId');
            if (!Object.hasOwn(snapshot, 'preferredSeedId'))
                copyIfPresent('seedId', 'preferredSeedId');
            for (const key of [
                'automation',
                'intervals',
                'friendQuietHours',
                'stealDelaySeconds',
                'plantOrderRandom',
                'plantDelaySeconds',
                'fertilizerBuyOrganicCount',
                'fertilizerBuyOrganicThresholdHours',
                'fertilizerBuyNormalCount',
                'fertilizerBuyNormalThresholdHours',
                'fertilizerBuyCheckIntervalMinutes',
                'emailClaimHour',
                'bagSeedPriority',
                'bagSeedMultiLandReservationEnabled',
                'bagSeedLandTypes',
                'bagSeedFallbackStrategy',
                'autoAcceptFriendMinLevel',
                'autoAcceptRequireOwnLevel',
                'autoAcceptHarvestStealEnabled',
                'autoAcceptHarvestStealHarvest',
                'autoAcceptHarvestStealSteal',
            ]) {
                copyIfPresent(key);
            }
            // One apply performs the only persistence for this save request.
            store.applyConfigSnapshot(snapshot, { accountId });
            const rev = nextConfigRevision();
            const config = buildConfigSnapshotForAccount(accountId);
            const { ui: _ui, ...savedConfig } = store.getConfigSnapshot(accountId);
            const result = {
                ...savedConfig,
                strategy: savedConfig.plantingStrategy,
                preferredSeed: savedConfig.preferredSeedId,
                saved: true,
                configRevision: rev,
            };
            const targetWorker = workers[accountId];
            if (!targetWorker || targetWorker.stopping || targetWorker.terminalHandled) {
                return {
                    ...result,
                    status: 'stopped',
                    stopped: true,
                    confirmed: false,
                    appliedRevision: null,
                };
            }
            try {
                const ack = await callWorkerApi(accountId, 'applyRuntimeConfigSnapshot', config);
                const appliedRevision = Number(ack && ack.appliedRevision);
                if (!Number.isFinite(appliedRevision) || appliedRevision < rev) {
                    const error = new Error(`Worker applied revision ${appliedRevision || 0}, expected at least ${rev}`);
                    error.code = 'CONFIG_ACK_REVISION_MISMATCH';
                    throw error;
                }
                return {
                    ...result,
                    status: 'confirmed',
                    stopped: false,
                    confirmed: true,
                    appliedRevision,
                };
            }
            catch (e) {
                const message = String(e?.message || e || 'Worker configuration ACK failed');
                const code = e?.code || (message === 'API Timeout' ? 'CONFIG_ACK_TIMEOUT' : 'CONFIG_ACK_FAILED');
                return {
                    ...result,
                    status: 'unconfirmed',
                    stopped: false,
                    confirmed: false,
                    unconfirmed: true,
                    appliedRevision: null,
                    confirmationError: {
                        code: String(code),
                        message,
                    },
                };
            }
        },
        setUITheme: async (theme) => {
            const snapshot = store.setUITheme(theme);
            return { ui: snapshot.ui || store.getUI() };
        },
        broadcastConfig: (accountId) => {
            broadcastConfigToWorkers(accountId);
        },
        broadcastGameConfigReload: () => {
            if (typeof broadcastGameConfigReloadOpt === 'function')
                broadcastGameConfigReloadOpt();
        },
        setRuntimeAccountName: (accountRef, accountName) => {
            const accountId = resolveAccountRefId(accountRef);
            if (!accountId)
                return;
            const worker = workers[accountId];
            if (worker) {
                worker.name = String(accountName || worker.name || accountId);
            }
        },
        getAccounts: () => {
            const data = getAccounts();
            data.accounts.forEach((a) => {
                const worker = workers[a.id];
                a.running = !!worker;
                // 账号维度的真实状态：登录中 / 等待重登（带倒计时）/ 运行中 / 已掉线 /
                // 停止中 / 已停止。账本里没有记录时（本次进程还没碰过这个账号）按
                // 有无子进程回落到「运行中 / 已停止」，与旧版字段语义保持一致。
                const runtime = getAccountRuntimeState(a.id);
                if (runtime) {
                    a.runtimeState = runtime.state;
                    a.reloginAt = runtime.state === 'relogin_waiting' ? runtime.reloginAt : 0;
                }
                else {
                    a.runtimeState = a.running ? 'running' : 'stopped';
                    a.reloginAt = 0;
                }
                if (worker && worker.status && worker.status.status && worker.status.status.name) {
                    a.nick = worker.status.status.name;
                }
                if (worker && worker.status && worker.status.status && worker.status.status.avatarUrl) {
                    a.avatar = worker.status.status.avatarUrl;
                }
            });
            return data;
        },
        startAccount: (accountRef) => {
            const accountId = resolveAccountRefId(accountRef);
            const acc = findAccountByAnyRef(accountId || accountRef);
            if (!acc)
                return false;
            // 用户点了「启动」：自动重登的等待应当立即作废，改走这次人工启动。
            cancelPendingReloginSafe(String(acc.id || accountId || ''));
            startWorker(acc);
            return true;
        },
        stopAccount: (accountRef) => {
            const accountId = resolveAccountRefId(accountRef);
            const acc = findAccountByAnyRef(accountId || accountRef);
            if (!acc)
                return false;
            if (accountId) {
                // 用户主动停止 = 明确不想再自动拉起。等待重登阶段账号本身没有子进程，
                // 只靠 stopWorker 停不掉那条定时器，到点会把它重新启动。
                cancelPendingReloginSafe(accountId);
                const hadWorker = !!workers[accountId];
                stopWorker(accountId);
                if (!hadWorker) {
                    // 本来就没在跑：不会有进程退出事件来收尾，直接把状态落成「已停止」。
                    setAccountRuntimeState(accountId, 'stopped');
                }
            }
            return true;
        },
        restartAccount: (accountRef) => {
            const accountId = resolveAccountRefId(accountRef);
            const acc = findAccountByAnyRef(accountId || accountRef);
            if (!acc)
                return false;
            // 手动重启要走确定的路径，别让一条还没到点的自动重登定时器在背后
            // 再来一次「换码 + 重启」，把刚起来的连接又打断。
            cancelPendingReloginSafe(accountId);
            restartWorker(acc);
            return true;
        },
        isAccountRunning: (accountRef) => {
            const accountId = resolveAccountRefId(accountRef);
            return !!(accountId && workers[accountId]);
        },
        getSchedulerStatus: async (accountRef) => {
            const accountId = resolveAccountRefId(accountRef);
            const runtime = getSchedulerRegistrySnapshot();
            let worker = null;
            let workerError = '';
            if (!accountId) {
                return { accountId: '', runtime, worker, workerError };
            }
            if (!workers[accountId]) {
                return { accountId, runtime, worker, workerError: '账号未运行' };
            }
            try {
                worker = await callWorkerApi(accountId, 'getSchedulers');
            }
            catch (e) {
                workerError = (e && e.message) ? e.message : String(e || 'unknown');
            }
            return { accountId, runtime, worker, workerError };
        },
    };
}
module.exports = {
    createDataProvider,
};
//# sourceMappingURL=data-provider.js.map