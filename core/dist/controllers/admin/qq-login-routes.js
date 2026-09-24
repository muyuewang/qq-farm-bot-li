"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const service_1 = require("../../services/qq-login/service");
const { createAuthRequired } = require('./middleware');
function publicTask(task) {
    return {
        task_id: task.taskId,
        status: task.status,
        qr_image: task.qrImage,
        expires_at: task.expiresAt,
    };
}
function sendError(res, error, fallback) {
    res.json({
        ok: false,
        error: String(error?.message || '').trim() || fallback,
    });
}
function mountQqLoginRoutes(app, ctx) {
    app.use('/api/qq-login', createAuthRequired(ctx));
    app.post('/api/qq-login/tasks', async (_req, res) => {
        try {
            const task = await (0, service_1.createLoginTask)();
            res.json({ ok: true, data: publicTask(task) });
        }
        catch (error) {
            sendError(res, error, 'QQ 登录任务创建失败');
        }
    });
    app.post('/api/qq-login/tasks/:taskId/status', async (req, res) => {
        try {
            const task = await (0, service_1.queryLoginStatus)(String(req.params.taskId || ''));
            res.json({ ok: true, data: publicTask(task) });
        }
        catch (error) {
            sendError(res, error, 'QQ 登录状态查询失败');
        }
    });
    app.post('/api/qq-login/tasks/:taskId/code', async (req, res) => {
        try {
            const result = await (0, service_1.getMiniappCode)(String(req.params.taskId || ''));
            res.json({ ok: true, data: { code: result.code, nickname: result.nickname || '', app_id: service_1.QQ_MINIAPP_APP_ID } });
        }
        catch (error) {
            sendError(res, error, 'QQ 小程序授权 Code 获取失败');
        }
    });
    app.post('/api/qq-login/tasks/:taskId/cancel', async (req, res) => {
        try {
            await (0, service_1.cancelLoginTask)(String(req.params.taskId || ''));
            res.json({ ok: true });
        }
        catch (error) {
            sendError(res, error, 'QQ 登录任务取消失败');
        }
    });
}
module.exports = { mountQqLoginRoutes };
//# sourceMappingURL=qq-login-routes.js.map