export {};
const { CONFIG, DEFAULT_CLIENT_VERSION } = require('../config/config');

function isWechatPlatform(platform: unknown = CONFIG.platform): boolean {
    return ['wx', 'wechat'].includes(String(platform || '').trim().toLowerCase());
}

// QQ 和微信共用同一个客户端版本号，不再按平台区分。
function getClientVersion(): string {
    return String(CONFIG.clientVersion || '').trim() || DEFAULT_CLIENT_VERSION;
}

function getLoginDeviceInfo(): Record<string, any> {
    const device = CONFIG.deviceInfo || {};
    const info: Record<string, any> = {
        client_version: getClientVersion(),
        sys_software: device.sysSoftware || 'Windows',
    };
    if (isWechatPlatform()) {
        if (device.network) info.network = String(device.network);
        if (device.deviceId) info.device_id = String(device.deviceId);
        const memory = Number(device.memory);
        if (Number.isSafeInteger(memory) && memory > 0) info.memory = memory;
    }
    return info;
}

module.exports = { isWechatPlatform, getClientVersion, getLoginDeviceInfo };
