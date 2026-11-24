"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('node:fs');
const path = require('node:path');
const { Server } = require('socket.io');
const SocketIOServer = Server;
const { getRuntimePaths } = require('../../config/runtime-paths');
const { getActiveWebBuildId } = require('./web-version');
const { resolveAccId, } = require('./middleware');
function applySocketSubscription(ctx, socket, accountRef = '') {
    const incoming = String(accountRef || '').trim();
    const resolved = incoming && incoming !== 'all' ? resolveAccId(ctx, incoming) : '';
    for (const room of socket.rooms) {
        if (room.startsWith('account:'))
            socket.leave(room);
    }
    if (resolved) {
        socket.join(`account:${resolved}`);
        socket.data.accountId = resolved;
    }
    else {
        socket.join('account:all');
        socket.data.accountId = '';
    }
    socket.emit('subscribed', { accountId: socket.data.accountId || 'all' });
    try {
        const targetId = socket.data.accountId || '';
        if (targetId && ctx.provider && typeof ctx.provider.getStatus === 'function') {
            const currentStatus = ctx.provider.getStatus(targetId);
            socket.emit('status:update', { accountId: targetId, status: currentStatus });
        }
        if (ctx.provider && typeof ctx.provider.getLogs === 'function') {
            // 冗余缓存：逐块务农日志密集，前端要先聚合再截断，快照给足原始行
            let currentLogs = ctx.provider.getLogs(targetId, { limit: 500 });
            if (!Array.isArray(currentLogs))
                currentLogs = [];
            socket.emit('logs:snapshot', {
                accountId: targetId || 'all',
                logs: currentLogs,
            });
        }
        if (ctx.provider && typeof ctx.provider.getAccountLogs === 'function') {
            let currentAccountLogs = ctx.provider.getAccountLogs(100);
            if (!Array.isArray(currentAccountLogs))
                currentAccountLogs = [];
            socket.emit('account-logs:snapshot', {
                logs: currentAccountLogs,
            });
        }
    }
    catch {
        // ignore snapshot push errors
    }
}
function setupSocketIO(ctx) {
    ctx.io = new SocketIOServer(ctx.server, {
        path: '/socket.io',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['x-admin-token', 'x-account-id'],
        },
    });
    ctx.io.use((socket, next) => {
        const authToken = socket.handshake.auth && socket.handshake.auth.token
            ? String(socket.handshake.auth.token)
            : '';
        const headerToken = socket.handshake.headers && socket.handshake.headers['x-admin-token']
            ? String(socket.handshake.headers['x-admin-token'])
            : '';
        const token = authToken || headerToken;
        if (!token || !ctx.tokens.has(token)) {
            return next(new Error('Unauthorized'));
        }
        socket.data.adminToken = token;
        return next();
    });
    let lastNotifiedBuildId = getActiveWebBuildId();
    let webWatchTimer = null;
    let webWatcher = null;
    const notifyIfWebChanged = () => {
        const nextBuildId = getActiveWebBuildId();
        if (nextBuildId && nextBuildId !== lastNotifiedBuildId) {
            lastNotifiedBuildId = nextBuildId;
            ctx.io?.emit('panel:version', { webBuildId: nextBuildId, ts: Date.now() });
        }
    };
    try {
        const pointerFile = getRuntimePaths().webRootPointerFile;
        const pointerDir = path.dirname(pointerFile);
        const pointerName = path.basename(pointerFile);
        if (fs.existsSync(pointerDir)) {
            webWatcher = fs.watch(pointerDir, (_eventType, filename) => {
                if (filename && String(filename) !== pointerName)
                    return;
                if (webWatchTimer)
                    clearTimeout(webWatchTimer);
                webWatchTimer = setTimeout(notifyIfWebChanged, 150);
                webWatchTimer.unref?.();
            });
            webWatcher.unref?.();
            webWatcher.on?.('error', () => {
                // ignore watcher errors on ephemeral filesystems
            });
        }
    }
    catch {
        // ignore fs.watch unsupported environments
    }
    ctx.server?.once('close', () => {
        if (webWatchTimer) {
            clearTimeout(webWatchTimer);
            webWatchTimer = null;
        }
        try {
            webWatcher?.close?.();
        }
        catch {
            // ignore close error
        }
        webWatcher = null;
    });
    ctx.io.on('connection', (socket) => {
        const initialAccountRef = (socket.handshake.auth && socket.handshake.auth.accountId)
            || (socket.handshake.query && socket.handshake.query.accountId)
            || '';
        applySocketSubscription(ctx, socket, initialAccountRef);
        socket.emit('ready', { ok: true, ts: Date.now(), webBuildId: getActiveWebBuildId() });
        socket.on('subscribe', (payload) => {
            if (!ctx.tokens.has(socket.data.adminToken))
                return socket.disconnect(true);
            const body = (payload && typeof payload === 'object') ? payload : {};
            applySocketSubscription(ctx, socket, body.accountId || '');
        });
    });
}
function emitRealtimeStatus(ctx, accountId, status) {
    if (!ctx.io)
        return;
    const id = String(accountId || '').trim();
    if (!id)
        return;
    // 推送到特定账号房间（只有订阅了该账号的用户能收到）
    ctx.io.to(`account:${id}`).emit('status:update', { accountId: id, status });
}
function emitRealtimeLog(ctx, entry) {
    if (!ctx.io)
        return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();
    // 如果没有指定账号ID，不推送给任何人（防止数据泄露）
    if (!id)
        return;
    // 推送到特定账号房间（只有订阅了该账号的用户能收到）
    ctx.io.to(`account:${id}`).emit('log:new', payload);
}
function emitRealtimeAccountLog(ctx, entry) {
    if (!ctx.io)
        return;
    const payload = (entry && typeof entry === 'object') ? entry : {};
    const id = String(payload.accountId || '').trim();
    // 如果没有指定账号ID，不推送给任何人（防止数据泄露）
    if (!id)
        return;
    // 推送到特定账号房间（只有订阅了该账号的用户能收到）
    ctx.io.to(`account:${id}`).emit('account-log:new', payload);
}
module.exports = {
    setupSocketIO,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
};
//# sourceMappingURL=socket.js.map