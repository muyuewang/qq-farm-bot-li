export const RELEASE_META_FILENAME: "release-meta.json";
export const UPDATE_SETTINGS_FILENAME: "update-settings.json";
export function readReleaseMeta(dir: any): any;
export function pairedWebReleases(backendBaseDir: any, backendIds: any): any;
export function readReleaseIpcVersion(dir: any): number;
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
export function readBackupEnabled(runtimeDir: any): boolean;
//# sourceMappingURL=release-compat.d.ts.map