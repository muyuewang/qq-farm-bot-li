import { EventEmitter } from 'node:events';
export declare function wireError(cause: any): {
    name: any;
    message: string;
    code: any;
    serviceName: any;
    methodName: any;
    errorMessage: any;
    clientSeq: any;
    outcomeUnknown: any;
};
interface SendHooks {
    beforeSend?: () => Error | null;
    onSent?: () => void;
}
export declare class SessionClient extends EventEmitter {
    private readonly socket;
    private readonly calls;
    private seq;
    private constructor();
    static open(role: 'control' | 'backend', timeoutMs?: number): Promise<SessionClient>;
    call(op: string, params?: any, timeoutMs?: number, hooks?: SendHooks): Promise<any>;
    private receive;
    private fail;
    close(): void;
}
export declare function listHostedSessions(): Promise<any[]>;
export declare function accountSessionKey(account: {
    id: string;
    createdAt: number;
}): string;
export declare function findAccountSession(sessions: any[], account: {
    id: string;
    createdAt: number;
    platform: string;
}): any;
export declare function stopHostedAccount(accountId: string, accountKey: string): Promise<void>;
export declare function getServiceSummary(): Promise<{
    backendInstanceId: string;
    backendReleaseId: string;
    hostRunning: boolean;
}>;
export {};
//# sourceMappingURL=ipc.d.ts.map