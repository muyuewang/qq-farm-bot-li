"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const notification_types_1 = require("../../config/notification-types");
const push_channels_1 = require("../../config/push-channels");
const qq_bot_push_1 = require("../../config/qq-bot-push");
const { DEFAULT_CLIENT_VERSION, DEFAULT_WX_CLIENT_VERSION, DEFAULT_TIME_ZONE, DEFAULT_AUTO_CODE_REFRESH, normalizeAutoCodeRefresh, normalizeTimeZone, resolveClientVersionUpdatedAt } = require('../../config/config');
const sharedState = require('./shared-state');
const { DEFAULT_OFFLINE_REMINDER, DEFAULT_LOGIN_SETTINGS, globalConfig, normalizeAccountConfig, cloneAccountConfig, DEFAULT_ACCOUNT_CONFIG, } = sharedState;
function normalizeOfflineReminder(input) {
    const src = (input && typeof input === 'object') ? input : {};
    let offlineDeleteSec = Number.parseInt(src.offlineDeleteSec, 10);
    if (!Number.isFinite(offlineDeleteSec) || offlineDeleteSec < 0) {
        offlineDeleteSec = DEFAULT_OFFLINE_REMINDER.offlineDeleteSec;
    }
    const channels = (0, push_channels_1.readPushChannels)(src);
    const primary = channels.find(entry => entry.enabled);
    const title = (src.title !== undefined && src.title !== null)
        ? String(src.title).trim()
        : DEFAULT_OFFLINE_REMINDER.title;
    const msg = (src.msg !== undefined && src.msg !== null)
        ? String(src.msg).trim()
        : DEFAULT_OFFLINE_REMINDER.msg;
    return {
        notificationTypes: (0, notification_types_1.normalizeNotificationTypes)(src.notificationTypes),
        channels,
        channel: primary?.channel ?? DEFAULT_OFFLINE_REMINDER.channel,
        endpoint: primary?.endpoint ?? '',
        token: primary?.token ?? '',
        secret: primary?.secret ?? '',
        title,
        msg,
        offlineDeleteSec,
    };
}
function saveGlobalConfig(changes = {}) {
    const next = { ...globalConfig, ...changes };
    const fallback = normalizeAccountConfig(next.defaultAccountConfig, DEFAULT_ACCOUNT_CONFIG);
    next.defaultAccountConfig = cloneAccountConfig(fallback);
    // Publish memory only after persistence succeeds. Account documents have their
    // own write path, so a global setting never scans or serializes all accounts.
    sharedState.configStorage.saveGlobal(next);
    Object.assign(globalConfig, next);
    sharedState.accountFallbackConfig = fallback;
}
function getUI() {
    return { ...globalConfig.ui };
}
function setUITheme(theme) {
    const t = String(theme || '').toLowerCase();
    const next = (t === 'light') ? 'light' : 'dark';
    saveGlobalConfig({ ui: { ...globalConfig.ui, theme: next } });
    return getUI();
}
function getOfflineReminder() {
    return normalizeOfflineReminder(globalConfig.offlineReminder);
}
function getQqBotPush() {
    return (0, qq_bot_push_1.normalizeQqBotPushConfig)(globalConfig.qqBotPush);
}
function setQqBotPush(cfg) {
    const next = (0, qq_bot_push_1.normalizeQqBotPushConfig)({ ...getQqBotPush(), ...(cfg || {}) });
    saveGlobalConfig({ qqBotPush: next });
    return getQqBotPush();
}
function normalizeLoginSettings(input) {
    const src = (input && typeof input === 'object') ? input : {};
    return {
        wechatQrLogin: typeof src.wechatQrLogin === 'boolean' ? src.wechatQrLogin : DEFAULT_LOGIN_SETTINGS.wechatQrLogin,
        qqQrLogin: typeof src.qqQrLogin === 'boolean' ? src.qqQrLogin : DEFAULT_LOGIN_SETTINGS.qqQrLogin,
        napCatEndpoint: typeof src.napCatEndpoint === 'string' ? src.napCatEndpoint.trim() : DEFAULT_LOGIN_SETTINGS.napCatEndpoint,
        napCatSignature: typeof src.napCatSignature === 'string' ? src.napCatSignature.trim() : DEFAULT_LOGIN_SETTINGS.napCatSignature,
    };
}
function getLoginSettings() {
    return normalizeLoginSettings(globalConfig.loginSettings);
}
function setLoginSettings(cfg) {
    const next = normalizeLoginSettings({ ...getLoginSettings(), ...(cfg || {}) });
    // 部署侧已经自带 NapCat（compose 的 napcat profile 会注入 NAPCAT_LOGIN_ENABLED，
    // 并且 NAPCAT_WEBUI_URL / NAPCAT_OPENAUTH_URL 就是取码链路真正使用的地址）时，
    // 不再要求面板里重复填地址和签名——运行时取码只读这两个环境变量。
    const napCatProvidedByHost = process.env.NAPCAT_LOGIN_ENABLED === 'true' || !!process.env.NAPCAT_WEBUI_URL;
    if (next.qqQrLogin && !napCatProvidedByHost && (!next.napCatEndpoint || !next.napCatSignature)) {
        throw new Error('开启 QQ 扫码登录前，请配置 NapCat 接口地址和接口签名');
    }
    saveGlobalConfig({ loginSettings: next });
    return getLoginSettings();
}
function setOfflineReminder(cfg = {}) {
    const current = getOfflineReminder();
    let channels = cfg.channels ?? current.channels;
    if (!cfg.channels && cfg.enabled !== undefined) {
        const selected = (0, push_channels_1.singlePushChannel)(current, cfg);
        const byName = new Map(current.channels.map(entry => [entry.channel, entry]));
        if (selected.endpoint || selected.token || selected.secret)
            byName.set(selected.channel, selected);
        else
            byName.delete(selected.channel);
        channels = [...byName.values()];
    }
    else if (!cfg.channels && ['channel', 'endpoint', 'token', 'secret'].some(key => Object.hasOwn(cfg, key))) {
        const selected = (0, push_channels_1.singlePushChannel)(current, cfg);
        // 单渠道表单只替换原先选中的渠道，保留 App 另行启用的渠道。
        const configured = (0, push_channels_1.isPushChannelConfigured)(selected);
        const changed = selected.channel !== current.channel || selected.endpoint !== current.endpoint
            || selected.token !== current.token || selected.secret !== current.secret;
        if (changed) {
            channels = current.channels.filter(entry => entry.channel !== selected.channel);
            if (selected.channel !== current.channel && configured) {
                channels = channels.map(entry => entry.channel === current.channel ? { ...entry, enabled: false } : entry);
            }
            if (configured)
                channels.unshift(selected);
        }
    }
    const next = normalizeOfflineReminder({
        ...current, ...cfg, channels,
        notificationTypes: { ...current.notificationTypes, ...cfg.notificationTypes },
    });
    saveGlobalConfig({ offlineReminder: next });
    return getOfflineReminder();
}
function getSystemConfig() {
    if (!globalConfig.systemConfig)
        return null;
    const config = globalConfig.systemConfig;
    return {
        ...config,
        // 旧配置没有该字段时默认开启，保证升级后重启自动生效。
        autoCodeRefresh: normalizeAutoCodeRefresh(config.autoCodeRefresh),
        // 旧配置没有该字段时默认开启：升级前用户从没关过这个开关。
        autoStartAccounts: config.autoStartAccounts !== false,
    };
}
function setSystemConfig(config) {
    if (!config || typeof config !== 'object')
        return null;
    const DEFAULT_DEVICE_INFO = {
        os: 'Windows',
        clientVersion: DEFAULT_CLIENT_VERSION,
        sysSoftware: 'Windows',
        network: 'wifi',
        memory: '16384',
        deviceId: 'DESKTOP-PC<WPC>',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
    };
    const current = globalConfig.systemConfig;
    const srcDevice = {
        ...(current?.deviceInfo || {}),
        ...((config.deviceInfo && typeof config.deviceInfo === 'object') ? config.deviceInfo : {}),
    };
    const topVersion = String(config.clientVersion || '').trim();
    const deviceVersion = String(config.deviceInfo?.clientVersion || '').trim();
    const requestedVersion = deviceVersion || topVersion || current?.clientVersion;
    const clientVersion = requestedVersion || DEFAULT_DEVICE_INFO.clientVersion;
    const currentVersion = String(globalConfig.systemConfig?.clientVersion || DEFAULT_DEVICE_INFO.clientVersion).trim();
    const currentUpdatedAt = Number(globalConfig.systemConfig?.clientVersionUpdatedAt);
    const clientVersionUpdatedAt = resolveClientVersionUpdatedAt(clientVersion, currentVersion, currentUpdatedAt, config.clientVersionUpdatedAt);
    // Older API clients may omit the new field; never copy the QQ version into it.
    const currentWxVersion = globalConfig.systemConfig?.wxClientVersion || DEFAULT_WX_CLIENT_VERSION;
    const wxClientVersion = config.wxClientVersion === undefined
        ? currentWxVersion : (String(config.wxClientVersion || '').trim() || DEFAULT_WX_CLIENT_VERSION);
    const wxClientVersionUpdatedAt = resolveClientVersionUpdatedAt(wxClientVersion, currentWxVersion, globalConfig.systemConfig?.wxClientVersionUpdatedAt, config.wxClientVersionUpdatedAt, Date.now(), 'wx');
    const deviceInfo = {
        os: String(srcDevice.os || DEFAULT_DEVICE_INFO.os).trim(),
        clientVersion,
        sysSoftware: String(srcDevice.sysSoftware || DEFAULT_DEVICE_INFO.sysSoftware).trim(),
        network: String(srcDevice.network || DEFAULT_DEVICE_INFO.network).trim(),
        memory: String(srcDevice.memory || DEFAULT_DEVICE_INFO.memory).trim(),
        deviceId: String(srcDevice.deviceId || DEFAULT_DEVICE_INFO.deviceId).trim(),
        userAgent: String(srcDevice.userAgent || DEFAULT_DEVICE_INFO.userAgent).trim(),
    };
    const next = {
        serverUrl: String(config.serverUrl ?? current?.serverUrl ?? '').trim(),
        clientVersion: deviceInfo.clientVersion,
        clientVersionUpdatedAt,
        wxClientVersion,
        wxClientVersionUpdatedAt,
        platform: String(config.platform || current?.platform || 'qq').trim(),
        os: deviceInfo.os,
        timeZone: normalizeTimeZone(config.timeZone || current?.timeZone || DEFAULT_TIME_ZONE),
        deviceInfo,
        // 只改账号保活时不要把其它系统设置清零：缺字段时沿用已保存的值。
        autoCodeRefresh: normalizeAutoCodeRefresh(config.autoCodeRefresh === undefined
            ? (current?.autoCodeRefresh || DEFAULT_AUTO_CODE_REFRESH)
            : config.autoCodeRefresh),
        // 同上：缺字段沿用已保存值，避免只保存保活配置时把自动登录关掉。
        autoStartAccounts: config.autoStartAccounts === undefined
            ? (current?.autoStartAccounts !== false)
            : config.autoStartAccounts === true,
    };
    saveGlobalConfig({ systemConfig: next });
    return { ...globalConfig.systemConfig };
}
// Initialize on load
const { loadGlobalConfig } = sharedState;
loadGlobalConfig();
// Apply offlineReminder / qqBotPush normalization after load
globalConfig.offlineReminder = normalizeOfflineReminder(globalConfig.offlineReminder);
globalConfig.qqBotPush = (0, qq_bot_push_1.normalizeQqBotPushConfig)(globalConfig.qqBotPush);
globalConfig.loginSettings = normalizeLoginSettings(globalConfig.loginSettings);
if (sharedState.systemConfigMigrated && !process.env.FARM_ACCOUNT_ID) {
    saveGlobalConfig();
    sharedState.systemConfigMigrated = false;
}
module.exports = {
    saveGlobalConfig,
    getUI,
    setUITheme,
    getLoginSettings,
    setLoginSettings,
    getOfflineReminder,
    setOfflineReminder,
    getQqBotPush,
    setQqBotPush,
    getSystemConfig,
    setSystemConfig,
};
//# sourceMappingURL=global-config.js.map