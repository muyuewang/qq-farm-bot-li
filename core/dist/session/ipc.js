"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionClient = void 0;
exports.wireError = wireError;
exports.listHostedSessions = listHostedSessions;
exports.accountSessionKey = accountSessionKey;
exports.findAccountSession = findAccountSession;
exports.stopHostedAccount = stopHostedAccount;
exports.getServiceSummary = getServiceSummary;
const node_events_1 = require("node:events");
const node_net_1 = __importDefault(require("node:net"));
const session_contract_1 = require("@qq-farm-bot/session-contract");
const { getRuntimePaths } = require('../config/runtime-paths');
function wireError(cause) {
    return {
        name: cause?.name, message: String(cause?.message ?? cause), code: cause?.code,
        serviceName: cause?.serviceName, methodName: cause?.methodName, errorMessage: cause?.errorMessage,
        clientSeq: cause?.clientSeq, outcomeUnknown: cause?.outcomeUnknown,
    };
}
class SessionClient extends node_events_1.EventEmitter {
    socket;
    calls = new Map();
    seq = 0;
    constructor() {
        super();
        this.socket = node_net_1.default.createConnection(getRuntimePaths().sessionSocketEndpoint);
        const decoder = new session_contract_1.FrameDecoder(frame => this.receive(frame), err => this.socket.destroy(err));
        this.socket.on('data', data => decoder.push(data));
        this.socket.on('error', err => this.fail(err));
        this.socket.once('close', () => {
            this.fail(new Error('会话宿主连接已关闭'));
            this.emit('closed');
        });
    }
    static async open(role, timeoutMs = 3000) {
        const client = new SessionClient();
        try {
            await client.call('hello', { ipcVersion: session_contract_1.SESSION_IPC_VERSION, role, instanceId: process.env.FARM_BACKEND_INSTANCE_ID }, timeoutMs);
            return client;
        }
        catch (err) {
            client.close();
            throw err;
        }
    }
    call(op, params = {}, timeoutMs = 3000, hooks) {
        if (this.socket.destroyed)
            return Promise.reject(new Error('会话宿主连接已关闭'));
        const id = String(++this.seq);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const pending = this.calls.get(id);
                this.calls.delete(id);
                if (!this.socket.destroyed)
                    this.socket.write((0, session_contract_1.encodeFrame)({ kind: 'cancel', id }));
                reject(Object.assign(new Error(`会话宿主请求超时: ${op}`), { outcomeUnknown: Boolean(pending?.approved) }));
            }, timeoutMs);
            this.calls.set(id, { resolve, reject, timer, hooks });
            try {
                this.socket.write((0, session_contract_1.encodeFrame)({ kind: 'req', id, op, params }));
            }
            catch (e) {
                clearTimeout(timer);
                this.calls.delete(id);
                reject(e);
            }
        });
    }
    receive(frame) {
        if (frame.kind === 'event') {
            this.emit('event', frame.event, frame.data);
            return;
        }
        const call = this.calls.get(frame.id);
        if (!call)
            return;
        if (frame.kind === 'prepare') {
            try {
                const blocked = call.hooks?.beforeSend?.();
                if (blocked)
                    throw blocked;
                // 从允许发送开始，掉线后按可能已发处理，不能再次扣费。
                call.hooks?.onSent?.();
                call.approved = true;
                this.socket.write((0, session_contract_1.encodeFrame)({ kind: 'decision', id: frame.id, ok: true }));
            }
            catch (err) {
                this.socket.write((0, session_contract_1.encodeFrame)({ kind: 'decision', id: frame.id, ok: false, error: wireError(err) }));
            }
            return;
        }
        if (frame.kind !== 'res')
            return;
        clearTimeout(call.timer);
        this.calls.delete(frame.id);
        if (frame.ok)
            call.resolve(frame.result);
        else
            call.reject(Object.assign(new Error(frame.error?.message || '会话请求失败'), frame.error));
    }
    fail(error) {
        for (const call of this.calls.values()) {
            clearTimeout(call.timer);
            call.reject(Object.assign(new Error(error.message), { outcomeUnknown: Boolean(call.approved) }));
        }
        this.calls.clear();
    }
    close() { this.socket.destroy(); }
}
exports.SessionClient = SessionClient;
async function listHostedSessions() {
    const client = await SessionClient.open('backend');
    try {
        return (await client.call('listSessions')).sessions;
    }
    finally {
        client.close();
    }
}
function accountSessionKey(account) {
    return JSON.stringify([String(account.id), account.createdAt]);
}
function findAccountSession(sessions, account) {
    const key = accountSessionKey(account);
    return sessions.find(s => s.accountKey === key && s.platform === account.platform);
}
async function stopHostedAccount(accountId, accountKey) {
    const client = await SessionClient.open('backend');
    try {
        await client.call('stopAccount', { accountId, accountKey });
    }
    finally {
        client.close();
    }
}
async function getServiceSummary() {
    let hostRunning = false;
    if (process.env.FARM_SESSION_SOCKET) {
        try {
            const client = await SessionClient.open('control', 800);
            client.close();
            hostRunning = true;
        }
        catch { /* 仍需返回后端实例，便于控制脚本诊断宿主是否可用。 */ }
    }
    return { backendInstanceId: process.env.FARM_BACKEND_INSTANCE_ID || '', backendReleaseId: process.env.FARM_RELEASE_ID || 'dev', hostRunning };
}
//# sourceMappingURL=ipc.js.map