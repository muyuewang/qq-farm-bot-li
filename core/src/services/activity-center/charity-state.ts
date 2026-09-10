export {};
/**
 * 公益小红花的纯状态归一化。
 *
 * 本模块不发协议请求，便于使用实机抓包固定任务、背包和土地状态口径。
 */

const { normalizeTaskInfo } = require('../task');
const { getSystemDateKey } = require('../../utils/utils');
const {
    int64String,
    int64Number,
    compareInt64,
    itemDto,
    bytesToText,
    textContent,
    businessError,
    activityWindowIsActive,
    readBagBalances,
} = require('./shared');

const CHARITY_RED_FLOWER_GROUP_ID = '2026090900';
const CHARITY_RED_FLOWER_ACTIVITY_ID = '2026090901';
const CHARITY_RED_FLOWER_LOVE_ITEM_ID = '1040';
const CHARITY_RED_FLOWER_SEED_ITEM_ID = '20883';
const CHARITY_RED_FLOWER_PLANT_ID = '1020883';
const CHARITY_RED_FLOWER_TASK_IDS = new Set(['200016', '200017', '200018']);

function findActivityData(entries: any[], activityId: string): any | null {
    const queue = Array.isArray(entries) ? [...entries] : [];
    while (queue.length > 0) {
        const entry = queue.shift();
        if (int64String(entry?.activity?.activity_id) === activityId) return entry;
        if (Array.isArray(entry?.children)) queue.push(...entry.children);
    }
    return null;
}

function charityRedFlowerDto(entry: any, serverTime = Math.floor(Date.now() / 1000)) {
    const activity = entry?.activity || {};
    const state = entry?.charity_red_flower;
    if (!state) throw businessError('CHARITY_RED_FLOWER_UNAVAILABLE', '服务端未发现公益小红花活动状态');

    const activityEndTime = int64Number(activity?.end_time);
    const stateEndTime = int64Number(state?.end_time);
    const endTime = stateEndTime > 0 ? stateEndTime : activityEndTime;
    const active = activityWindowIsActive({ begin_time: activity?.begin_time, end_time: endTime }, serverTime);
    const loveBalance = int64String(state?.love_balance);
    const donatedLove = int64String(state?.donated_love);
    const globalDonatedLove = int64String(state?.global_donated_love);
    const globalTargetLove = int64String(state?.global_target_love);
    const seedRewardStatus = int64String(state?.seed_reward_status);
    const agreementStatus = int64String(state?.agreement_status);
    const publicFundStatus = int64String(state?.public_fund?.status);
    const publicFundDate = int64String(state?.public_fund?.date);
    const hasPublicFundRecord = publicFundStatus !== '0'
        || publicFundDate !== '0'
        || !!state?.public_fund?.order_id;
    const currentDate = getSystemDateKey(serverTime * 1000).replace(/-/g, '');
    const dailyGiftClaimed = publicFundDate === currentDate;
    const dailyGiftEligible = compareInt64(donatedLove, state?.settlement_required_love) >= 0;
    const progressRewards = (Array.isArray(state?.progress_rewards) ? state.progress_rewards : []).map((reward: any) => {
        const target = int64String(reward?.target);
        const statusCode = int64String(reward?.status);
        const reached = compareInt64(donatedLove, target) >= 0 || statusCode !== '0';
        const claimed = reward?.claimed === true || int64String(reward?.claimed) === '1';
        return {
            target,
            reward: itemDto(reward?.reward),
            statusCode,
            reached,
            claimed,
            claimable: active && reached && !claimed,
            claimSupported: true,
        };
    });
    const globalRewardTarget = int64String(state?.global_reward?.target) !== '0'
        ? int64String(state?.global_reward?.target)
        : globalTargetLove;

    return {
        groupId: CHARITY_RED_FLOWER_GROUP_ID,
        activityId: CHARITY_RED_FLOWER_ACTIVITY_ID,
        name: bytesToText(activity?.name) || '公益小红花',
        title: bytesToText(activity?.name) || '公益小红花',
        startTime: int64String(activity?.begin_time),
        endTime: String(endTime || 0),
        serverTime: String(serverTime),
        active,
        rules: textContent(activity?.extra),
        love: itemDto({ item_id: state?.love_item_id, count: loveBalance }),
        loveBalance,
        donatedLove,
        flowStatus: int64String(state?.flow_status),
        agreementStatus,
        seedReward: {
            statusCode: seedRewardStatus,
            // 仅保留已抓包确认的旧映射；状态 1 的语义尚未通过操作前后包确认。
            claimable: seedRewardStatus === '2',
            claimed: seedRewardStatus === '3',
            reward: itemDto(state?.seed_reward),
        },
        dailyGift: {
            statusCode: int64String(state?.daily_reward_status),
            claimed: dailyGiftClaimed,
            reward: itemDto(state?.daily_reward),
            publicFund: hasPublicFundRecord ? {
                date: publicFundDate,
                statusCode: publicFundStatus,
            } : null,
        },
        progressRewards,
        globalProgress: {
            donated: globalDonatedLove,
            target: globalTargetLove,
            reached: compareInt64(globalDonatedLove, globalTargetLove) >= 0,
            rewardTarget: globalRewardTarget,
            reward: itemDto(state?.global_reward?.reward),
        },
        settlement: {
            requiredLove: int64String(state?.settlement_required_love),
            eligible: dailyGiftEligible,
            reward: itemDto(state?.settlement_reward),
        },
        actions: {
            acceptAgreement: {
                enabled: active && agreementStatus !== '1',
                available: active && agreementStatus !== '1',
                availabilityKnown: true,
            },
            share: {
                enabled: active && agreementStatus === '1',
                available: active && agreementStatus === '1',
                attemptable: active && agreementStatus === '1',
                // 活动状态没有返回“今日已分享”字段，只能在写操作时由服务端判定。
                availabilityKnown: false,
            },
            claimSeeds: {
                enabled: active && seedRewardStatus === '2',
                available: active && seedRewardStatus === '2',
                availabilityKnown: true,
            },
            donateLove: {
                enabled: active && compareInt64(loveBalance, '0') > 0,
                available: active && compareInt64(loveBalance, '0') > 0,
                availabilityKnown: true,
                count: int64Number(loveBalance),
            },
            claimProgressReward: {
                enabled: progressRewards.some((reward: any) => reward.claimable),
                available: progressRewards.some((reward: any) => reward.claimable),
                availabilityKnown: true,
            },
            claimDailyGift: {
                // 公益记录只用于展示“今日已送”；是否还能送由活动服务端在操作时判定。
                enabled: active,
                available: active && dailyGiftEligible && !dailyGiftClaimed,
                attemptable: active,
                availabilityKnown: false,
            },
        },
    };
}

function charitySeedTaskSummary(taskInfoReply: any) {
    const taskInfo = taskInfoReply?.task_info || taskInfoReply || {};
    const normalized = normalizeTaskInfo(taskInfo);
    const allTasks = [
        ...normalized.growthTasks,
        ...normalized.dailyTasks,
        ...normalized.otherTasks,
    ];
    const tasks = allTasks
        .filter((task: any) => {
            const id = int64String(task?.id);
            const rewards = Array.isArray(task?.extra_rewards) ? task.extra_rewards : [];
            return CHARITY_RED_FLOWER_TASK_IDS.has(id)
                || rewards.some((reward: any) => int64String(reward?.id ?? reward?.item_id) === CHARITY_RED_FLOWER_SEED_ITEM_ID);
        })
        .map((task: any) => {
            const progress = int64String(task?.progress);
            const target = int64String(task?.total_progress);
            const seedReward = (Array.isArray(task?.extra_rewards) ? task.extra_rewards : [])
                .find((reward: any) => int64String(reward?.id ?? reward?.item_id) === CHARITY_RED_FLOWER_SEED_ITEM_ID);
            const completed = compareInt64(progress, target) >= 0 && compareInt64(target, '0') > 0;
            const claimed = !!task?.is_claimed;
            const unlocked = !!task?.is_unlocked;
            return {
                id: int64String(task?.id),
                description: String(task?.desc || ''),
                progress,
                target,
                completed,
                claimed,
                unlocked,
                claimable: unlocked && completed && !claimed,
                group: int64String(task?.group),
                conditionType: int64String(task?.cond_type),
                shareMultiple: int64String(task?.share_multiple),
                seedReward: itemDto(seedReward || { id: CHARITY_RED_FLOWER_SEED_ITEM_ID, count: 0 }),
            };
        })
        .sort((left: any, right: any) => Number(left.group) - Number(right.group) || Number(left.id) - Number(right.id));

    return {
        tasks,
        totalCount: tasks.length,
        completedCount: tasks.filter((task: any) => task.completed).length,
        claimedCount: tasks.filter((task: any) => task.claimed).length,
        claimableCount: tasks.filter((task: any) => task.claimable).length,
    };
}

function charityInventory(bagReply: any) {
    const balances = readBagBalances(bagReply, [
        CHARITY_RED_FLOWER_SEED_ITEM_ID,
        CHARITY_RED_FLOWER_LOVE_ITEM_ID,
    ]);
    return {
        seed: itemDto({ id: CHARITY_RED_FLOWER_SEED_ITEM_ID, count: balances.get(CHARITY_RED_FLOWER_SEED_ITEM_ID) || '0' }),
        love: itemDto({ id: CHARITY_RED_FLOWER_LOVE_ITEM_ID, count: balances.get(CHARITY_RED_FLOWER_LOVE_ITEM_ID) || '0' }),
    };
}

function currentPlantPhase(phases: any[], serverTime: number): any | null {
    const list = Array.isArray(phases) ? phases : [];
    if (list.length === 0) return null;
    let current: any | null = null;
    for (const phase of list) {
        const beginTime = int64Number(phase?.begin_time);
        if (beginTime <= serverTime && (!current || beginTime >= int64Number(current?.begin_time))) current = phase;
    }
    return current || list[0];
}

function charityRedFlowerLandSummary(landsReply: any, serverTime = Math.floor(Date.now() / 1000)) {
    const details = (Array.isArray(landsReply?.lands) ? landsReply.lands : [])
        .filter((land: any) => int64String(land?.plant?.id) === CHARITY_RED_FLOWER_PLANT_ID)
        .map((land: any) => {
            const plant = land?.plant || {};
            const phase = currentPlantPhase(plant?.phases, serverTime);
            const phaseCode = int64Number(phase?.phase);
            const maturePhase = (Array.isArray(plant?.phases) ? plant.phases : [])
                .find((entry: any) => int64Number(entry?.phase) === 6);
            const matureAt = int64Number(maturePhase?.begin_time);
            const status = phaseCode === 6 ? 'harvestable' : phaseCode === 7 ? 'dead' : 'growing';
            return {
                landId: int64String(land?.id),
                status,
                phaseCode: String(phaseCode),
                season: int64String(plant?.season),
                matureAt: String(matureAt || 0),
                matureInSec: Math.max(0, matureAt - serverTime),
                leftOrganicFertilizerTimes: int64String(plant?.left_inorc_fert_times),
            };
        })
        .sort((left: any, right: any) => Number(left.landId) - Number(right.landId));

    return {
        total: details.length,
        growing: details.filter((land: any) => land.status === 'growing').length,
        harvestable: details.filter((land: any) => land.status === 'harvestable').length,
        dead: details.filter((land: any) => land.status === 'dead').length,
        landIds: details.map((land: any) => land.landId),
        details,
    };
}

module.exports = {
    CHARITY_RED_FLOWER_GROUP_ID,
    CHARITY_RED_FLOWER_ACTIVITY_ID,
    CHARITY_RED_FLOWER_LOVE_ITEM_ID,
    CHARITY_RED_FLOWER_SEED_ITEM_ID,
    CHARITY_RED_FLOWER_PLANT_ID,
    findActivityData,
    charityRedFlowerDto,
    charitySeedTaskSummary,
    charityInventory,
    charityRedFlowerLandSummary,
};
