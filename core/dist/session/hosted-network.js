"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostedNetwork = void 0;
const ipc_1 = require("./ipc");
class HostedNetwork {
    config;
    events;
    restore;
    notify;
    client;
    released = false;
    socket = null;
    load;
    constructor(config, events, restore, notify) {
        this.config = config;
        this.events = events;
        this.restore = restore;
        this.notify = notify;
    }
    async connect(code, onLoginSuccess) {
        try {
            const client = await ipc_1.SessionClient.open('backend');
            if (this.released) {
                client.close();
                return;
            }
            this.client = client;
            client.on('closed', () => this.disconnected({ source: 'session_ipc', reason: '与会话宿主的连接已关闭' }));
            client.on('event', (event, data) => {
                if (this.released)
                    return;
                if (event === 'notify' && this.socket)
                    this.notify(Buffer.from(data, 'base64'));
                if (event === 'telemetry')
                    this.load = data.load;
                if (event === 'disconnected')
                    this.disconnected(data);
                if (event === 'ws_error' || event === 'kickout')
                    this.events.emit(event, data);
            });
            const { accountId, accountKey, sessionId, ...settings } = this.config;
            this.config = undefined;
            const args = sessionId ? { accountId, accountKey, sessionId } : { accountId, accountKey, config: { ...settings, code } };
            const { snapshot } = await client.call(sessionId ? 'attachSession' : 'openSession', args, 60000);
            if (this.released)
                return;
            this.load = snapshot.load;
            this.restore(snapshot);
            this.socket = { readyState: 1 };
            await onLoginSuccess?.();
        }
        catch (err) {
            this.disconnected({ source: 'session_attach', reason: err.message });
        }
    }
    disconnected(data) {
        if (this.released)
            return;
        this.released = true;
        this.socket = null;
        this.client?.close();
        this.events.emit('disconnected', data);
    }
    async request(service, method, body, options, hooks) {
        if (!this.socket || !this.client)
            throw new Error(`会话未连接: ${method}`);
        const result = await this.client.call('request', {
            service, method, body: Buffer.from(body).toString('base64'), options,
            guarded: Boolean(hooks.beforeSend || hooks.onSent),
        }, options.timeoutMs + 1500, hooks);
        return { body: Buffer.from(result.body, 'base64'), meta: result.meta };
    }
    activate() { return this.client?.call('activate'); }
    async release(op) {
        if (this.released)
            return;
        this.released = true;
        this.socket = null;
        if (!this.client)
            return;
        try {
            await this.client.call(op);
        }
        finally {
            this.client.close();
        }
    }
    invalidate(reason) {
        void this.release('close').catch(() => { }).finally(() => this.events.emit('disconnected', { source: 'game_scene_unknown', reason }));
    }
}
exports.HostedNetwork = HostedNetwork;
//# sourceMappingURL=hosted-network.js.map