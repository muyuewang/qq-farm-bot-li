/**
 * pm2 双进程配置：会话宿主 + 后端
 *
 * 游戏 WebSocket 连接由 session-host 进程持有，后端只通过本地 IPC 发请求。
 * 因此 `pm2 restart qq-farm-backend` 不会断开游戏连接，后端重新起来后会
 * 自动 attach 回原来的会话（见 core/src/runtime/runtime-engine.ts 的
 * `listHostedSessions()` + `startWorker(account, session.sessionId)`）。
 *
 * 用法：
 *   pm2 start ecosystem.config.cjs --only qq-farm-host
 *   pm2 start ecosystem.config.cjs --only qq-farm-backend
 *   pm2 save
 *
 * 注意：
 *   - 必须是 fork 模式、单实例（backend-writer.lock 是独占锁，两个后端会直接报 LOCK_ALREADY_HELD）
 *   - 重启后端用 `pm2 restart qq-farm-backend`，不要用 `pm2 restart all`
 *   - `pm2 restart qq-farm-host` 会真的断线（宿主持有连接），只在升级会话层代码时才重启它
 */
const path = require('node:path');

const REPO = __dirname;
const CORE = path.join(REPO, 'core');
const DATA = path.join(CORE, 'data');
const RUNTIME = path.join(REPO, 'runtime');
const SOCKET = path.join(RUNTIME, 'session-host.sock');

// 两个进程必须拿到完全一致的路径，否则会各自算出一个 IPC 端点，永远连不上。
const sharedEnv = {
    NODE_ENV: 'production',
    FARM_DATA_DIR: DATA,
    FARM_RUNTIME_DIR: RUNTIME,
    FARM_SESSION_SOCKET: SOCKET,
    ADMIN_PORT: process.env.ADMIN_PORT || '3007',
};

module.exports = {
    apps: [
        {
            name: 'qq-farm-host',
            script: path.join(CORE, 'dist', 'session', 'host.js'),
            cwd: REPO,
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            max_restarts: 1000,
            min_uptime: '20s',
            restart_delay: 2000,
            exp_backoff_restart_delay: 200,
            // 默认 1600ms 会在优雅退出（解绑会话）完成前 SIGKILL
            kill_timeout: 15000,
            // 账号子进程必须一起收掉：残留子进程会占着 backend-children.json，
            // 新后端会以 BACKEND_CHILDREN_STILL_ALIVE 拒绝启动
            treekill: true,
            time: true,
            merge_logs: true,
            out_file: path.join(DATA, 'session-host', 'logs', 'pm2-out.log'),
            error_file: path.join(DATA, 'session-host', 'logs', 'pm2-err.log'),
            env: {
                ...sharedEnv,
                FARM_HOST_DATA_DIR: path.join(DATA, 'session-host'),
                FARM_HOST_LOG_DIR: path.join(DATA, 'session-host', 'logs'),
            },
        },
        {
            name: 'qq-farm-backend',
            script: path.join(CORE, 'client.js'),
            cwd: REPO,
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            max_restarts: 1000,
            min_uptime: '20s',
            // 宿主还没起来时后端会启动失败退出，留出重试间隔
            restart_delay: 5000,
            exp_backoff_restart_delay: 200,
            kill_timeout: 15000,
            treekill: true,
            time: true,
            merge_logs: true,
            out_file: path.join(DATA, 'logs', 'pm2-out.log'),
            error_file: path.join(DATA, 'logs', 'pm2-err.log'),
            env: {
                ...sharedEnv,
                FARM_BACKEND_LOG_DIR: path.join(DATA, 'logs'),
            },
        },
    ],
};
