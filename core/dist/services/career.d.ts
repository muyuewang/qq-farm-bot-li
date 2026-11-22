export {};
export interface RanchCareerInfo {
    harvest: number;
    mature: number;
    steal: number;
    products: {
        id: number;
        count: number;
    }[];
}
export interface CareerInfo {
    gid: number;
    harvest: number;
    steal: number;
    level: number;
    name: string;
    ranch: RanchCareerInfo | null;
}
//# sourceMappingURL=career.d.ts.map