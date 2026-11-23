export interface ReleaseCompatInfo {
    compatible: boolean;
    outdated: boolean;
    reasons: string[];
}
export interface RollbackReleaseItem {
    releaseId: string;
    createdAt: number;
    commit: string;
    shortCommit: string;
    commitSubject: string;
    pairedWebReleaseId: string;
    sizeBytes: number;
    isActive: boolean;
    isPrevious: boolean;
    canRollback: boolean;
    canDelete: boolean;
    compat: ReleaseCompatInfo;
}
export interface ReleasesSummary {
    totalCount: number;
    compatibleCount: number;
    outdatedCount: number;
    totalSizeBytes: number;
    outdatedSizeBytes: number;
    orphanHostCount: number;
    orphanWebCount: number;
    orphanSizeBytes: number;
}
export interface ReleaseManagerOptions {
    repoRoot: string | null;
    runtimeDir: string;
    releasesDir?: string | null;
    appRoot: string;
    applySupported: boolean;
    deployBusy: boolean;
    execGit?: (cwd: string, args: string[]) => Promise<string>;
}
export interface DeleteReleasesOptions {
    runtimeDir: string;
    releasesDir: string;
    releaseIds?: unknown;
    cleanOrphans?: boolean;
    appRoot: string;
}
export interface DeleteReleasesResult {
    deletedReleaseIds: string[];
    deletedWebIds: string[];
    deletedHostIds: string[];
    freedBytes: number;
}
//# sourceMappingURL=release-manager.d.ts.map