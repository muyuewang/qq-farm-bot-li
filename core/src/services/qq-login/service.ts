import type { LoginSettings } from '../../types/config';
export {};

const axios = require('axios').default;
const store = require('../../models/store');
const crypto = require('node:crypto');
const fs = require('node:fs');

const QQ_MINIAPP_APP_ID = '1112386029';
const REQUEST_TIMEOUT_MS = 120_000;
const TTL_MS = 120000;

let webUiCredential = '';

export type QqLoginTaskStatus
    = 'waiting_scan'
    | 'scanned'
    | 'confirmed'
    | 'cancelled'
    | 'expired'
    | 'failed';

export interface QqLoginTask {
    taskId: string;
    status: QqLoginTaskStatus;
    qrImage: string;
    expiresAt: number;
}

function loginSettings(): LoginSettings {
    const settings = store.getLoginSettings();
    if (!settings?.qqQrLogin)
        throw new Error('QQ扫码登录未开启');
    if (!settings.napCatEndpoint || !settings.napCatSignature)
        throw new Error('请先配置 NapCat 接口地址和 NapCat Token');
    return settings;
}

function apiUrl(endpoint: string, path: string): string {
    return `${endpoint.replace(/\/+$/, '')}${path}`;
}

function napCatErrorMessage(data: any): string {
    const errorCode = String(data?.code || '').trim().toUpperCase();
    switch (errorCode) {
        case 'SIGNATURE_REQUIRED':
            return 'NapCat Token 缺失，请检查配置';
        case 'INVALID_SIGNATURE':
            return 'NapCat Token 无效，请检查配置';
        case 'WORKFLOW_BUSY':
            return 'NapCat 登录工作流繁忙，请稍后重试';
        case 'LOGIN_REQUIRED':
            return 'QQ 登录尚未确认，请先完成扫码确认';
        case 'LOGOUT_REQUIRED':
            return '上一位 QQ 登录尚未注销，请稍后重试';
        case 'TASK_EXPIRED':
            return 'QQ 登录任务已过期，请重新获取二维码';
        default:
            return `NapCat 接口返回失败${errorCode ? `（${errorCode}）` : ''}`;
    }
}

function normalizeTask(raw: any): QqLoginTask {
    const task = (raw?.task && typeof raw.task === 'object') ? raw.task : {};
    const taskId = String(task.id || '').trim();
    const status = String(task.status || '').trim() as QqLoginTaskStatus;
    const qrImage = String(task.qrImage || '').trim();
    const expiresAt = Number(task.expiresAt);
    if (!taskId)
        throw new Error('NapCat 返回的登录任务无效');
    if (!qrImage)
        throw new Error('NapCat 未返回登录二维码');
    return {
        taskId,
        status,
        qrImage,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    };
}

async function webUiLogin(settings: LoginSettings): Promise<string> {
    if (webUiCredential) return webUiCredential;
    
    const token = settings.napCatSignature;
    const hash = crypto.createHash('sha256').update(`${token}.napcat`).digest('hex');
    
    try {
        const response = await axios.post(apiUrl(settings.napCatEndpoint, '/auth/login'), { hash }, {
            timeout: REQUEST_TIMEOUT_MS,
            validateStatus: status => status === 200,
            headers: { 'Content-Type': 'application/json' },
        });
        const credential = response?.data?.data?.Credential || '';
        if (!credential) throw new Error('NapCat WebUI 登录失败');
        webUiCredential = credential;
        return credential;
    } catch (error: any) {
        throw new Error(`NapCat WebUI 登录失败: ${error.message}`);
    }
}

async function requestWebUI(settings: LoginSettings, path: string, body: any = {}): Promise<any> {
    const credential = await webUiLogin(settings);
    try {
        const response = await axios.post(apiUrl(settings.napCatEndpoint, path), body, {
            timeout: REQUEST_TIMEOUT_MS,
            validateStatus: status => status === 200,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${credential}`,
            },
        });
        const data = response?.data;
        if (data?.code !== undefined && Number(data.code) !== 0) {
            throw new Error(data.message || 'NapCat WebUI 请求失败');
        }
        return data;
    } catch (error: any) {
        if (/unauthorized|credential|凭证|认证/i.test(error.message)) {
            webUiCredential = '';
        }
        throw error;
    }
}

function normalize(value: any): any {
    if (!value || typeof value !== 'object') return value;
    return { ...value, ...(value.data || {}), ...(value.result || {}), ...(value.data?.result || {}) };
}

async function createLoginTask(): Promise<QqLoginTask> {
    const settings = loginSettings();
    
    // 清除旧的credential
    webUiCredential = '';
    
    // 刷新二维码
    try {
        await requestWebUI(settings, '/QQLogin/RefreshQRcode');
        await new Promise(resolve => setTimeout(resolve, 300));
    } catch {}
    
    // 获取二维码
    const result = await requestWebUI(settings, '/QQLogin/GetQQLoginQrcode');
    const raw = result.qrcode || result.qrCode || result.qrUrl || result.qr_url || result.image || result.base64;
    if (!raw) throw new Error('NapCat 未返回登录二维码');
    
    const qrImage = /^data:image\//i.test(raw) 
        ? raw 
        : (`^[a-z0-9+/]+={0,2}$/i.test(raw) && raw.length > 128 
            ? `data:image/png;base64,${raw}` 
            : raw);
    
    const task = { 
        id: crypto.randomBytes(18).toString('hex'), 
        owner: '', 
        status: 'waiting_scan' as QqLoginTaskStatus, 
        qrImage, 
        expiresAt: Date.now() + TTL_MS 
    };
    
    // 保存任务到全局变量
    globalThis._qqLoginTask = task;
    
    return { taskId: task.id, status: task.status, qrImage: task.qrImage, expiresAt: task.expiresAt };
}

async function queryLoginStatus(taskId: string): Promise<QqLoginTask> {
    const settings = loginSettings();
    const task = globalThis._qqLoginTask;
    
    if (!task || task.id !== taskId) {
        throw new Error('登录任务不存在或已过期');
    }
    
    if (task.expiresAt <= Date.now()) {
        throw new Error('登录任务已过期');
    }
    
    const state = await requestWebUI(settings, '/QQLogin/CheckLoginStatus');
    const text = `${state.status || ''} ${state.message || ''}`.toLowerCase();
    
    if (state.isLogin === true) {
        try {
            const user = normalize(await requestWebUI(settings, '/QQLogin/GetQQLoginInfo'));
            if (user.uin) {
                task.user = user;
                task.status = 'confirmed';
            }
        } catch {}
    } else if (/scanned|待确认|等待确认/.test(text)) {
        task.status = 'scanned';
    } else if (/expired|timeout|过期|失效/.test(text)) {
        task.status = 'expired';
    }
    
    return { taskId: task.id, status: task.status, qrImage: task.qrImage, expiresAt: task.expiresAt };
}

async function getMiniappCode(taskId: string): Promise<string> {
    const settings = loginSettings();
    const task = globalThis._qqLoginTask;
    
    if (!task || task.id !== taskId) {
        throw new Error('登录任务不存在或已过期');
    }
    
    if (task.status !== 'confirmed') {
        throw new Error('请先完成 QQ 扫码确认');
    }
    
    // 检查插件状态
    let ready = false;
    for (let i = 0; i < 40; i++) {
        try {
            const health = await axios.get(apiUrl(settings.napCatEndpoint, '/plugin/qq-miniapp-openauth/api/status'), {
                timeout: 5000,
                headers: { 'Authorization': `Bearer ${settings.napCatSignature}` },
            });
            if (health.data?.ok === true && health.data?.ready === true) {
                ready = true;
                break;
            }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!ready) {
        throw new Error('QQ 已确认登录，但 NapCat 上下文尚未就绪，请稍后重试');
    }
    
    // 获取小程序授权码
    const result = await axios.post(apiUrl(settings.napCatEndpoint, '/plugin/qq-miniapp-openauth/api/miniapp'), 
        { appId: QQ_MINIAPP_APP_ID, interactive: true }, 
        {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.napCatSignature}`,
            },
        }
    );
    
    const authCode = String(result.data?.code || '').trim();
    if (!result.data?.ok || !authCode) {
        throw new Error(result.data?.error || 'NapCat 未返回小程序授权 Code');
    }
    
    return authCode;
}

async function cancelLoginTask(taskId: string): Promise<void> {
    const task = globalThis._qqLoginTask;
    if (task && task.id === taskId) {
        // 尝试登出
        try {
            const settings = loginSettings();
            await requestWebUI(settings, '/QQLogin/SetQuickLoginQQ', { uin: '' });
        } catch {}
        delete globalThis._qqLoginTask;
    }
}

export {
    cancelLoginTask,
    createLoginTask,
    getMiniappCode,
    QQ_MINIAPP_APP_ID,
    queryLoginStatus,
};