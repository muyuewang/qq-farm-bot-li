import type { AutomationConfig, FertilizerMode } from '../../types/config';
export declare function isRipeningOnlyMode(mode: FertilizerMode): boolean;
export declare function runRipeningFertilizer(automation: Pick<AutomationConfig, 'fertilizer' | 'fertilizer_land_types' | 'fertilizer_smart_seconds'>, lands?: any[], propagateErrors?: boolean): Promise<number>;
//# sourceMappingURL=ripening.d.ts.map