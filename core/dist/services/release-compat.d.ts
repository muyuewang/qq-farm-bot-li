export const RELEASE_META_FILENAME: "release-meta.json";
export function readReleaseMeta(dir: any): any;
export function readReleaseVersions(dir: any): {
    qq: string;
    wx: string;
    ipc: number;
};
export function compareReleaseVersions(target: any, current: any, hostIpcVersion?: any): {
    compatible: boolean;
    outdated: boolean;
    reasons: string[];
};
//# sourceMappingURL=release-compat.d.ts.map