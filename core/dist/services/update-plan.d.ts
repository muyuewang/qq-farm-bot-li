export const installStamp: "node_modules/.cache/farm-install";
export function inspectInstallation(root: any): {
    needed: boolean;
    valid: boolean;
    fingerprint: string;
    file: string;
};
export function turboArgs(root: any, components: any): any[];
export function buildEnv(pnpmCommand?: string): {
    NODE_ENV: string;
    TURBO_TELEMETRY_DISABLED: string;
    TZ?: string | undefined;
};
export function targetFingerprints(root: any): Promise<{
    [k: string]: any;
}>;
export function runningComponents({ repoRoot, runtimeDir, releasesDir, env, contract }: {
    repoRoot: any;
    runtimeDir: any;
    releasesDir: any;
    env?: NodeJS.ProcessEnv;
    contract?: typeof import("@qq-farm-bot/session-contract");
}): {
    web: {
        id: string;
        dir: string;
        hash: any;
    };
    backend: {
        id: string;
        hash: string;
    };
    host: {
        id: string;
        hash: string;
    };
};
export function compareComponents(targets: any, running: any): {
    web: boolean;
    backend: boolean;
    host: string;
};
export function hostMaintenanceMessage(state: any): "" | "游戏连接服务有更新，本次继续使用在线版本。可在结束挂机后单独升级。" | "在线的游戏连接服务缺少版本记录，暂时无法判断是否需要升级。当前挂机继续。";
//# sourceMappingURL=update-plan.d.ts.map