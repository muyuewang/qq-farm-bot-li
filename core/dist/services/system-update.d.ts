import type { ReleasesSummary, RollbackReleaseItem } from './release-manager';
declare const spawn: any;
export interface IncomingCommitInfo {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    timestampMs: number;
}
export interface PanelUpdateJobState {
    id: string;
    pid?: number;
    status: 'running' | 'succeeded' | 'failed';
    phase: string;
    detail?: string;
    startedAt: number;
    updatedAt: number;
    finishedAt?: number;
    exitCode?: number | null;
    error?: string;
    fromCommit?: string;
    targetCommit?: string;
    recentLines: string[];
}
export interface SystemUpdateStatus {
    mode: 'source' | 'docker' | 'binary' | 'unknown';
    gitSupported: boolean;
    unsupportedReason: string;
    applySupported: boolean;
    applyUnsupportedReason: string;
    branch: string;
    detached: boolean;
    commit: string;
    shortCommit: string;
    commitSubject: string;
    startupCommit: string;
    needsApply: boolean;
    updateHint: string;
    hostMaintenance: string;
    upstream: string;
    remote: string;
    remoteBranch: string;
    behindCount: number;
    aheadCount: number;
    dirtyFiles: string[];
    incomingCommits: IncomingCommitInfo[];
    canCheck: boolean;
    canPull: boolean;
    canApply: boolean;
    deployBusy: boolean;
    lastCheckedAt: number | null;
    lastCheckError: string;
    lastPulledAt: number | null;
    job: PanelUpdateJobState | null;
    releases: RollbackReleaseItem[];
    releasesSummary: ReleasesSummary;
    keepBackups: boolean;
}
export interface SystemUpdateServiceOptions {
    repoRoot?: string | null;
    runtimeDir?: string;
    releasesDir?: string;
    isPackaged?: boolean;
    isDocker?: boolean;
    invocationId?: string;
    controlManaged?: boolean;
    spawnRunner?: typeof spawn;
    execGit?: (cwd: string, args: string[]) => Promise<string>;
    now?: () => number;
}
export {};
//# sourceMappingURL=system-update.d.ts.map