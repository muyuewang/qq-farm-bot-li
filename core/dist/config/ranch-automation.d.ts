export declare const RANCH_AUTOMATION_DEFAULTS: {
    ranch_harvest: boolean;
    ranch_produce: boolean;
    ranch_buy: boolean;
    ranch_upgrade: boolean;
    ranch_sell: boolean;
    ranch_grass: boolean;
    ranch_grass_buy: boolean;
    ranch_fill_cans: boolean;
    ranch_feed_normal: boolean;
    ranch_feed_organic: boolean;
    ranch_clean: boolean;
    ranch_stroke: boolean;
    ranch_friend_steal: boolean;
    ranch_friend_clean: boolean;
    ranch_friend_mosquito: boolean;
    ranch_task: boolean;
    ranch_share: boolean;
    ranch_check_minutes: number;
    ranch_strategy: "level" | "preferred" | "bag_priority";
    ranch_bag_fallback: "level" | "preferred";
    ranch_coop_animal: number;
    ranch_shed_animal: number;
};
export type RanchAutomationConfig = typeof RANCH_AUTOMATION_DEFAULTS;
export declare const RANCH_SWITCH_KEYS: string[];
export declare const RANCH_ANIMAL_OPTIONS: {
    value: number;
    label: string;
    kind: string;
}[];
export declare function normalizeRanchSetting(key: string, value: unknown): boolean | number | string;
//# sourceMappingURL=ranch-automation.d.ts.map