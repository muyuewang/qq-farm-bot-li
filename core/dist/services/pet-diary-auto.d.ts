declare const PET_DIARY_AUTOMATION_KEYS: readonly ["pet_diary_adopt", "pet_diary_feed", "pet_diary_draw", "pet_diary_story_claim", "pet_diary_seed_claim", "pet_diary_solar_claim", "pet_diary_treasure_open", "pet_diary_compensation_claim", "pet_diary_charm_equip", "pet_diary_battle"];
declare const CHALLENGE_IDS: string[];
declare function isPetDiaryAutomationEnabled(automation?: any): boolean;
declare function createPetDiaryAutomation(deps: {
    getPetDiary: () => Promise<any>;
    operatePetDiary: (action: string, params?: any) => Promise<any>;
    getServerTimeSec: () => number;
    log: (module: string, message: string, meta?: any) => void;
    getFriendsList?: () => Promise<any[]>;
    getFriend?: (gid: string) => Promise<any>;
}): {
    runPetDiaryAutomation: (flags: {
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
    }) => Promise<{
        nextTreasureEndMs?: number;
    }>;
    isPetDiaryAutomationEnabled: typeof isPetDiaryAutomationEnabled;
};
//# sourceMappingURL=pet-diary-auto.d.ts.map