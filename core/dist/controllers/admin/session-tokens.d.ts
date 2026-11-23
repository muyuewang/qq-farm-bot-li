export {};
export interface PersistentTokenSetOptions {
    filePath?: string;
    getFingerprint?: () => string;
    now?: () => number;
    ttlMs?: number;
    maxSessions?: number;
}
export interface PersistentTokenSet {
    add: (token: string) => PersistentTokenSet;
    has: (token: string) => boolean;
    delete: (token: string) => boolean;
    clear: () => void;
    readonly size: number;
    snapshot: () => {
        has: (token: string) => boolean;
    };
}
//# sourceMappingURL=session-tokens.d.ts.map