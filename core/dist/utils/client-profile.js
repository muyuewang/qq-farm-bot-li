"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { CONFIG, DEFAULT_CLIENT_VERSION } = require('../config/config');
function isWechatPlatform(platform = CONFIG.platform) {
    return ['wx', 'wechat'].includes(String(platform || '').trim().toLowerCase());
}
// QQ 和微信共用同一个客户端版本号，不再按平台区分。
function getClientVersion() {
    return String(CONFIG.clientVersion || '').trim() || DEFAULT_CLIENT_VERSION;
}
function getLoginDeviceInfo() {
    const device = CONFIG.deviceInfo || {};
    const info = {
        client_version: getClientVersion(),
        sys_software: device.sysSoftware || 'Windows',
    };
    if (isWechatPlatform()) {
        if (device.network)
            info.network = String(device.network);
        if (device.deviceId)
            info.device_id = String(device.deviceId);
        const memory = Number(device.memory);
        if (Number.isSafeInteger(memory) && memory > 0)
            info.memory = memory;
    }
    return info;
}
module.exports = { isWechatPlatform, getClientVersion, getLoginDeviceInfo };
//# sourceMappingURL=client-profile.js.map