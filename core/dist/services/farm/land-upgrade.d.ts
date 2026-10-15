export declare function buildLandUpgradeDetail(land: any, landsMap?: Map<number, any>): {
    mode: string;
    current: {
        level: number;
        name: string;
        image: string;
        yieldBonus: number;
        growthReduction: number;
        expBonus: number;
        mutantMultiplier: number;
        resonanceBonus: number;
    };
    next: {
        level: number;
        name: string;
        image: string;
        yieldBonus: number;
        growthReduction: number;
        expBonus: number;
        mutantMultiplier: number;
        resonanceBonus: number;
    };
    serverAllowed: boolean;
    needLevel: number;
    prerequisite: {
        landId: number;
        met: boolean;
    };
    costs: {
        id: string;
        count: string;
        name: any;
        image: any;
    }[];
    unknown: boolean;
} | {
    mode: string;
    current: {
        level: number;
        name: string;
        image: string;
        yieldBonus: number;
        growthReduction: number;
        expBonus: number;
        mutantMultiplier: number;
        resonanceBonus: number;
    };
    next: any;
    costs: any[];
    unknown: boolean;
    serverAllowed?: undefined;
    needLevel?: undefined;
    prerequisite?: undefined;
};
//# sourceMappingURL=land-upgrade.d.ts.map