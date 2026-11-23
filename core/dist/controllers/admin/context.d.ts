import type { Application } from 'express';
import type { Server } from 'node:http';
import type { Server as SocketIOServer } from 'socket.io';
import type { PersistentTokenSet } from './session-tokens';
export {};
export interface AdminContext {
    tokens: Set<string> | PersistentTokenSet;
    app: Application | null;
    server: Server | null;
    io: SocketIOServer | null;
    provider: any;
}
//# sourceMappingURL=context.d.ts.map