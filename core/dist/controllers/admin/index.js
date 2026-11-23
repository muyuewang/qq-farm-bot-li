"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Admin panel HTTP server orchestrator.
 * Thin wrapper that wires up Express, routes, Socket.IO, and shared context.
 */
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { CONFIG } = require('../../config/config');
const { getResourcePath } = require('../../config/runtime-paths');
const { createModuleLogger } = require('../../services/logger');
const { createAdminContext } = require('./context');
const { mountAuthRoutes } = require('./auth-routes');
const { mountAccountRoutes } = require('./account-routes');
const { mountFarmRoutes } = require('./farm-routes');
const { mountFriendRoutes } = require('./friend-routes');
const { mountActivityCenterRoutes } = require('./activity-center-routes');
const { mountCommerceRoutes } = require('./commerce-routes');
const { mountDebugRoutes } = require('./debug-routes');
const { mountSystemUpdateRoutes } = require('./system-update-routes');
const { readWebBuildInfo } = require('./web-version');
const { mountWxLoginRoutes } = require('./wx-login-routes');
const { mountQqLoginRoutes } = require('./qq-login-routes');
const { setupSocketIO, emitRealtimeStatus: _emitStatus, emitRealtimeLog: _emitLog, emitRealtimeAccountLog: _emitAccountLog, } = require('./socket');
const adminLogger = createModuleLogger('admin');
let ctx = null;
function startAdminServer(dataProvider) {
    if (ctx)
        return;
    ctx = createAdminContext(dataProvider);
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    ctx.app = app;
    app.use((req, res, next) => {
        const allowedOrigins = CONFIG.ALLOWED_ORIGINS || ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        }
        else if (!origin) {
            res.header('Access-Control-Allow-Origin', '*');
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, PUT');
        res.header('Access-Control-Allow-Headers', 'Content-Type, x-account-id, x-admin-token, x-proxy-api-key, x-proxy-api-url, x-proxy-app-id');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400');
        if (req.method === 'OPTIONS')
            return res.sendStatus(200);
        next();
    });
    const { getWebRootInfo } = require('../../config/runtime-paths');
    const resolveActiveWebDirs = () => {
        const { webRoot, fallbackRoots } = getWebRootInfo();
        return [webRoot, ...fallbackRoots];
    };
    const staticMiddlewareCache = new Map();
    const setNoStoreHeaders = (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    };
    const serveDynamicWeb = (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/game-config') || req.path.startsWith('/socket.io'))
            return next();
        const dirs = resolveActiveWebDirs();
        for (const cached of staticMiddlewareCache.keys()) {
            if (!dirs.includes(cached))
                staticMiddlewareCache.delete(cached);
        }
        let idx = 0;
        const step = (err) => {
            if (err)
                return next(err);
            if (idx >= dirs.length)
                return next();
            const dir = dirs[idx++];
            let mw = staticMiddlewareCache.get(dir);
            if (!mw) {
                mw = express.static(dir, {
                    setHeaders: (staticRes, filePath) => {
                        const base = path.basename(filePath).toLowerCase();
                        if (base === 'index.html' || base === 'version.json') {
                            setNoStoreHeaders(staticRes);
                        }
                    },
                });
                staticMiddlewareCache.set(dir, mw);
            }
            mw(req, res, step);
        };
        step();
    };
    const sendDynamicIndex = (res, fallbackStatus) => {
        for (const dir of resolveActiveWebDirs()) {
            const indexPath = path.join(dir, 'index.html');
            if (fs.existsSync(indexPath)) {
                setNoStoreHeaders(res);
                return res.sendFile(indexPath);
            }
        }
        if (fallbackStatus !== 200)
            res.status(fallbackStatus);
        res.send('web build not found. Please build the web project.');
    };
    app.get('/version.json', (_req, res) => {
        setNoStoreHeaders(res);
        const { webRoot } = getWebRootInfo();
        const info = readWebBuildInfo(webRoot);
        if (info) {
            return res.json(info);
        }
        return res.json({ buildId: '', appVersion: '', builtAt: 0 });
    });
    const [webDist] = resolveActiveWebDirs();
    app.use(serveDynamicWeb);
    if (!fs.existsSync(webDist)) {
        adminLogger.warn('web build not found', { webDist });
        app.get('/', (_req, res) => sendDynamicIndex(res, 200));
    }
    app.use('/game-config', express.static(getResourcePath('gameConfig')));
    // Mount route modules
    mountAuthRoutes(app, ctx);
    mountWxLoginRoutes(app, ctx);
    mountQqLoginRoutes(app, ctx);
    mountFarmRoutes(app, ctx);
    mountFriendRoutes(app, ctx);
    mountAccountRoutes(app, ctx);
    mountActivityCenterRoutes(app, ctx);
    mountCommerceRoutes(app, ctx);
    mountDebugRoutes(app, ctx);
    mountSystemUpdateRoutes(app, ctx);
    // SPA fallback
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/game-config')) {
            return res.status(404).json({ ok: false, error: 'Not Found' });
        }
        return sendDynamicIndex(res, 404);
    });
    const port = CONFIG.adminPort || 3007;
    ctx.server = app.listen(port, '0.0.0.0', () => {
        adminLogger.info('admin panel started', { url: `http://localhost:${port}`, port });
    });
    // Setup Socket.IO
    setupSocketIO(ctx);
}
async function stopAdminServer() {
    const server = ctx?.server;
    if (!server)
        return;
    ctx?.io?.disconnectSockets(true);
    const closed = new Promise(resolve => server.close(() => resolve()));
    server.closeAllConnections?.();
    await closed;
}
function emitRealtimeStatus(accountId, status) {
    if (!ctx)
        return;
    _emitStatus(ctx, accountId, status);
}
function emitRealtimeLog(entry) {
    if (!ctx)
        return;
    _emitLog(ctx, entry);
}
function emitRealtimeAccountLog(entry) {
    if (!ctx)
        return;
    _emitAccountLog(ctx, entry);
}
module.exports = {
    startAdminServer, stopAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
};
//# sourceMappingURL=index.js.map