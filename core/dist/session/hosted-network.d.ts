import type { EventEmitter } from 'node:events';
export declare class HostedNetwork {
    private config;
    private events;
    private restore;
    private notify;
    private client?;
    private released;
    socket: {
        readyState: number;
    } | null;
    load: any;
    constructor(config: any, events: EventEmitter, restore: (snapshot: any) => void, notify: (body: Buffer) => void);
    connect(code: string | null, onLoginSuccess?: () => void): Promise<void>;
    private disconnected;
    request(service: string, method: string, body: Buffer, options: any, hooks: any): Promise<{
        body: Buffer<ArrayBuffer>;
        meta: any;
    }>;
    activate(): Promise<any>;
    release(op: 'detach' | 'close'): Promise<void>;
    invalidate(reason: string): void;
}
//# sourceMappingURL=hosted-network.d.ts.map