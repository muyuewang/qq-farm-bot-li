declare const RANCH_FEED_STAGES: readonly ["any", "longest", "to_production", "near_harvest"];
export type RanchFeedStage = typeof RANCH_FEED_STAGES[number];
export declare const RANCH_NEAR_HARVEST_MS: number;
export declare const RANCH_AUTOMATION_DEFAULTS: {
    ranch_harvest: boolean;
    ranch_produce: boolean;
    ranch_buy: boolean;
    ranch_activate_shed: boolean;
    ranch_upgrade: boolean;
    ranch_sell: boolean;
    ranch_market_organic: boolean;
    ranch_market_organic_poop: boolean;
    ranch_market_organic_pinecone: boolean;
    ranch_grass: boolean;
    ranch_grass_buy: boolean;
    ranch_grass_threshold_percent: number;
    ranch_fill_cans: boolean;
    ranch_feed_normal: boolean;
    ranch_feed_normal_stage: RanchFeedStage;
    ranch_feed_organic: boolean;
    ranch_feed_organic_stage: RanchFeedStage;
    ranch_clean: boolean;
    ranch_stroke: boolean;
    ranch_friend_steal: boolean;
    ranch_friend_clean: boolean;
    ranch_friend_mosquito: boolean;
    ranch_task: boolean;
    ranch_illustrated: boolean;
    ranch_share: boolean;
    ranch_daily_benefit: boolean;
    ranch_check_minutes: number;
    ranch_strategy: "level" | "preferred" | "bag_priority";
    ranch_bag_fallback: "level" | "preferred";
    ranch_coop_animal: number;
    ranch_shed_animal: number;
    ranch_coop_cub_priority: number[];
    ranch_shed_cub_priority: number[];
};
export type RanchAutomationConfig = typeof RANCH_AUTOMATION_DEFAULTS;
export declare const RANCH_SWITCH_KEYS: string[];
export declare const RANCH_ANIMAL_OPTIONS: {
    value: number;
    label: string;
    kind: string;
}[];
export declare function normalizeRanchSetting(key: string, value: unknown): boolean | number | string | number[];
export declare const RANCH_MARKET_SWITCH_BY_CURRENCY: {
    readonly 7002: "ranch_market_organic_poop";
    readonly 1008: "ranch_market_organic_pinecone";
};
export declare const RANCH_MARKET_SWITCH_KEYS: ("ranch_market_organic_poop" | "ranch_market_organic_pinecone")[];
/** 旧配置的总开关只填充缺失的新字段，已明确设置的独立开关优先。 */
export declare function migrateRanchMarketAutomation(input: Record<string, any>): Record<string, any>;
export declare function isRanchMarketEnabled(input: Partial<RanchAutomationConfig>): boolean;
export {};
//# sourceMappingURL=ranch-automation.d.ts.map