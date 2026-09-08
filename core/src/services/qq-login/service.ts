import type { LoginSettings } from '../../types/config';
export {};

const axios = require('axios').default;
const store = require('../../models/store');
const crypto = require('node:crypto');
const fs = require('node:fs');

const QQ_MINIAPP_APP_ID = '1112386029';
const REQUEST_TIMEOUT_MS = 120_000;
const TTL_MS = 120000;
const TOKEN_FILE = process.env.NAPCAT_TOKEN_FILE || '/app/napcat-auth/token';

let webUiCredential = '';

// 全局任务存储
declare global {
    var _qqLoginTask: {
        id: string;
        owner: string;
        status: QqLoginTaskStatus;
        qrImage: string;
        expiresAt: number;
        user?: any;
    } | undefined;
}

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

function authToken(): string {
    try {
        return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    } catch {
        return '';
    }
}

function napCatEndpoint(): string {
    return process.env.NAPCAT_WEBUI_URL || 'http://napcat:6099/api';
}

function napCatOpenAuthEndpoint(): string {
    return process.env.NAPCAT_OPENAUTH_URL || 'http://napcat:6099/plugin/qq-miniapp-openauth/api';
}

function loginSettings(): LoginSettings {
    const settings = store.getLoginSettings();
    if (!settings?.qqQrLogin)
        throw new Error('QQ扫码登录未开启');
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

async function webUiLogin(): Promise<string> {
    if (webUiCredential) return webUiCredential;
    
    const token = authToken();
    if (!token) throw new Error('NapCat Token 文件不存在或为空');
    
    const hash = crypto.createHash('sha256').update(`${token}.napcat`).digest('hex');
    const endpoint = napCatEndpoint();
    
    console.log('[QQ Login] 尝试登录NapCat WebUI...');
    console.log('[QQ Login] Endpoint:', endpoint);
    
    try {
        const response = await axios.post(apiUrl(endpoint, '/auth/login'), { hash }, {
            timeout: REQUEST_TIMEOUT_MS,
            validateStatus: status => status === 200,
            headers: { 'Content-Type': 'application/json' },
        });
        const credential = response?.data?.data?.Credential || '';
        if (!credential) throw new Error('NapCat WebUI 登录失败');
        webUiCredential = credential;
        console.log('[QQ Login] WebUI登录成功');
        return credential;
    } catch (error: any) {
        console.error('[QQ Login] WebUI登录失败:', error.message);
        throw new Error(`NapCat WebUI 登录失败: ${error.message}`);
    }
}

async function requestWebUI(path: string, body: any = {}): Promise<any> {
    const credential = await webUiLogin();
    const endpoint = napCatEndpoint();
    try {
        const response = await axios.post(apiUrl(endpoint, path), body, {
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
    loginSettings();
    
    console.log('[QQ Login] 开始创建登录任务...');
    
    // 清除旧的credential
    webUiCredential = '';
    
    // 刷新二维码
    try {
        console.log('[QQ Login] 刷新二维码...');
        await requestWebUI('/QQLogin/RefreshQRcode');
        await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error: any) {
        console.log('[QQ Login] 刷新二维码失败，继续尝试获取:', error.message);
    }
    
    // 获取二维码
    console.log('[QQ Login] 获取二维码...');
    let result;
    try {
        result = await requestWebUI('/QQLogin/GetQQLoginQrcode');
    } catch (error: any) {
        // 如果QQ已经登录，需要先登出
        if (/QQ Is Logined/i.test(error.message)) {
            console.log('[QQ Login] QQ已登录，尝试登出...');
            try {
                await requestWebUI('/QQLogin/SetQuickLoginQQ', { uin: '' });
                await new Promise(resolve => setTimeout(resolve, 500));
                // 重新获取二维码
                result = await requestWebUI('/QQLogin/GetQQLoginQrcode');
            } catch (logoutError: any) {
                console.error('[QQ Login] 登出失败:', logoutError.message);
                throw new Error('QQ已登录，请先在NapCat中登出QQ');
            }
        } else {
            throw error;
        }
    }
    
    const raw = result.qrcode || result.qrCode || result.qrUrl || result.qr_url || result.image || result.base64;
    if (!raw) {
        console.error('[QQ Login] NapCat返回数据:', JSON.stringify(result));
        throw new Error('NapCat 未返回登录二维码');
    }
    
    console.log('[QQ Login] 二维码获取成功');
    
    const qrImage = /^data:image\//i.test(raw) 
        ? raw 
        : (/^[a-z0-9+/]+={0,2}$/i.test(raw) && raw.length > 128 
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
    
    console.log('[QQ Login] 登录任务创建成功，ID:', task.id);
    
    return { taskId: task.id, status: task.status, qrImage: task.qrImage, expiresAt: task.expiresAt };
}

async function queryLoginStatus(taskId: string): Promise<QqLoginTask> {
    loginSettings();
    const task = globalThis._qqLoginTask;
    
    if (!task || task.id !== taskId) {
        throw new Error('登录任务不存在或已过期');
    }
    
    if (task.expiresAt <= Date.now()) {
        throw new Error('登录任务已过期');
    }
    
    const state = await requestWebUI('/QQLogin/CheckLoginStatus');
    const text = `${state.status || ''} ${state.message || ''}`.toLowerCase();
    
    if (state.isLogin === true) {
        try {
            const user = normalize(await requestWebUI('/QQLogin/GetQQLoginInfo'));
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
    loginSettings();
    const task = globalThis._qqLoginTask;
    
    if (!task || task.id !== taskId) {
        throw new Error('登录任务不存在或已过期');
    }
    
    if (task.status !== 'confirmed') {
        throw new Error('请先完成 QQ 扫码确认');
    }
    
    const token = authToken();
    const openAuthEndpoint = napCatOpenAuthEndpoint();
    
    // 检查插件状态
    let ready = false;
    for (let i = 0; i < 40; i++) {
        try {
            const health = await axios.get(apiUrl(openAuthEndpoint, '/status'), {
                timeout: 5000,
                headers: { 'Authorization': `Bearer ${token}` },
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
    const result = await axios.post(apiUrl(openAuthEndpoint, '/miniapp'), 
        { appId: QQ_MINIAPP_APP_ID, interactive: true }, 
        {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
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
            await requestWebUI('/QQLogin/SetQuickLoginQQ', { uin: '' });
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