const PET_DIARY_AUTOMATION_KEYS = [
    'pet_diary_adopt',
    'pet_diary_feed',
    'pet_diary_draw',
    'pet_diary_story_claim',
    'pet_diary_seed_claim',
    'pet_diary_solar_claim',
    'pet_diary_treasure_open',
    'pet_diary_compensation_claim',
    'pet_diary_charm_equip',
    'pet_diary_battle',
] as const;

const CHALLENGE_IDS = ['80101', '80102', '80103'];

function isPetDiaryAutomationEnabled(automation: any = {}): boolean {
    return PET_DIARY_AUTOMATION_KEYS.some(key => automation[key] === true);
}

function createPetDiaryAutomation(deps: {
    getPetDiary: () => Promise<any>;
    operatePetDiary: (action: string, params?: any) => Promise<any>;
    getServerTimeSec: () => number;
    log: (module: string, message: string, meta?: any) => void;
    getFriendsList?: () => Promise<any[]>;
    getFriend?: (gid: string) => Promise<any>;
}) {
    const { getPetDiary, operatePetDiary, getServerTimeSec, log, getFriendsList, getFriend } = deps;
    const spacer = () => new Promise(resolve => setTimeout(resolve, 400));
    const serverNowMs = () => getServerTimeSec() * 1000;

    async function runPetDiaryBattles(pet: any): Promise<any> {
        if (!getFriendsList || !getFriend) return pet;
        const available = (id: string) => pet.balances?.some((item: any) => String(item.id) === id && item.known !== false && Number(item.count) > 0);
        if (!pet.active || !pet.hunt?.canPlunder || pet.battleCount >= pet.battleLimit || !CHALLENGE_IDS.some(id => available(id))) return pet;

        const friends = [...new Map((await getFriendsList()).map((f: any) => [String(f.gid), f])).values()];
        if (!friends.length) return pet;

        const budgetMs = 30000;
        const deadline = serverNowMs() + budgetMs;
        let scanned = 0;
        let battles = 0;

        try {
            for (const friend of friends) {
                if (serverNowMs() >= deadline) break;
                const gid = String(friend.gid);
                if (!/^[1-9]\d*$/.test(gid)) continue;

                let friendData: any;
                try {
                    friendData = await getFriend(gid);
                    scanned++;
                } catch {
                    break;
                }
                if (String(friendData.gid) !== gid) continue;

                let target: any;
                let challengeId: string | undefined;
                for (const id of CHALLENGE_IDS) {
                    if (!available(id)) continue;
                    target = friendData.treasures?.find((t: any) => t.status === 2 && t.endTime > serverNowMs()
                        && t.previews?.some((p: any) => String(p.challengeId) === id && p.canStart === true));
                    if (target) { challengeId = id; break; }
                }
                if (!target || !challengeId) continue;

                try {
                    const result = await operatePetDiary('battle', { gid, treasureId: target.id, challengeId });
                    battles++;
                    if (!result?.snapshot) break;
                    pet = result.snapshot;
                } catch {
                    break;
                }
            }
        } catch {
            // Silently stop on network errors
        }
        return pet;
    }

    async function runPetDiaryAutomation(flags: {
        adopt: boolean;
        feed: boolean;
        draw: boolean;
        story: boolean;
        seeds: boolean;
        solar: boolean;
        treasure: boolean;
        compensation: boolean;
        battle: boolean;
        charm: boolean;
    }): Promise<{ nextTreasureEndMs?: number }> {
        const step = async (enabled: boolean, event: string, ready: () => boolean, action: string, params: any = {}): Promise<boolean> => {
            try {
                if (!enabled || !ready()) return false;
                const result = await operatePetDiary(action, params);
                if (result?.snapshot) pet = result.snapshot;
                const rewards = (result?.rewards || []).map((item: any) => `${item.name}x${item.count}`).join(', ');
                log('活动', `萌宠日记${event}完成${rewards ? `，${rewards}` : ''}`, {
                    module: 'activity', event: `萌宠日记${event}`, result: 'success',
                });
                return true;
            } catch (err: any) {
                log('活动', `萌宠日记${event}失败: ${err.message}`, {
                    module: 'activity', event: `萌宠日记${event}`, result: 'error',
                });
                return false;
            }
        };

        let pet = await getPetDiary();
        if (!pet || pet.active !== true) return;

        // 领养比熊
        await step(flags.adopt, '领养比熊', () => pet.nurture?.initialized !== true, 'initialize');

        // 投喂（最多12次直到成年）
        let fed = 0;
        while (flags.feed && pet.nurture?.canFeed === true && fed < 12) {
            if (!await step(true, '投喂', () => true, 'feed')) break;
            fed++;
            await spacer();
        }

        // 领取比熊（成年后）
        await step(flags.adopt, '领取比熊',
            () => pet.nurture?.adult === true && pet.nurture?.dogGranted !== true, 'claimDog');

        // 选锦囊（投喂之后，寻宝之前）
        if (flags.charm && pet.charms?.canChoose && pet.charms.pool?.length) {
            await step(true, '选择锦囊', () => true, 'equipCharm', { charmId: pet.charms.pool[0].id });
        }

        // 寻宝（最多12次）
        let drawn = 0;
        while (flags.draw && pet.hunt?.canDraw === true && drawn < 12) {
            if (!await step(true, '寻宝', () => true, 'draw')) break;
            drawn++;
            await spacer();
        }

        // 领取爪印手记
        if (flags.story) {
            let claimed = 0;
            while (claimed < 20) {
                const story = (pet.stories || []).find((item: any) => item.unlocked && !item.claimed);
                if (!story) break;
                if (!await step(true, '领取手记', () => true, 'story', { order: story.order })) break;
                claimed++;
                await spacer();
            }
        }

        // 领取种子礼包
        await step(flags.seeds, '领取种子礼包', () => pet.seeds?.canClaim === true, 'seeds');

        // 领取节令小礼
        if (flags.solar) {
            for (const term of (pet.solarTerms?.terms || [])) {
                if (term.canClaim !== true) continue;
                await step(true, `领取${term.name || '节令'}好礼`, () => true, 'solar', { termId: term.id });
                await spacer();
            }
        }

        // 开启宝藏
        const treasureReady = () => (pet.treasures || []).some((item: any) => item.status === 3
            || (item.status === 2 && item.endTime > 0 && item.endTime <= serverNowMs()));
        if (flags.treasure) {
            let opened = 0;
            while (treasureReady() && opened < 20) {
                if (!await step(true, '开启宝藏', () => true, 'openTreasure')) break;
                opened++;
                await spacer();
            }
        }

        // 领取夺宝补偿
        await step(flags.compensation, '领取夺宝补偿',
            () => BigInt(String(pet.compensationCount || '0')) > 0n, 'compensation');

        // 好友夺宝
        if (flags.battle) {
            pet = await runPetDiaryBattles(pet);
        }

        // 设置精准唤醒定时器（宝藏护送完成时）
        let nextTreasureEndMs: number | undefined;
        if (flags.treasure) {
            const nowMs = serverNowMs();
            const nextEnd = (pet.treasures || [])
                .filter((item: any) => item.status === 2 && item.endTime > nowMs)
                .map((item: any) => item.endTime)
                .sort((a: number, b: number) => a - b)[0];
            if (nextEnd) {
                nextTreasureEndMs = Math.max(1000, nextEnd - nowMs + 2000);
            }
        }
        return { nextTreasureEndMs };
    }

    return { runPetDiaryAutomation, isPetDiaryAutomationEnabled };
}

module.exports = { createPetDiaryAutomation, isPetDiaryAutomationEnabled, PET_DIARY_AUTOMATION_KEYS };
