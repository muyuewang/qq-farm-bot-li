"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUSHOO_CHANNELS = void 0;
exports.normalizePushChannel = normalizePushChannel;
exports.isPushChannelConfigured = isPushChannelConfigured;
exports.readPushChannels = readPushChannels;
exports.singlePushChannel = singlePushChannel;
exports.PUSHOO_CHANNELS = new Set([
    'webhook', 'qmsg', 'serverchan', 'pushplus', 'pushplushxtrip',
    'dingtalk', 'wecom', 'bark', 'gocqhttp', 'onebot', 'atri',
    'pushdeer', 'igot', 'telegram', 'feishu', 'ifttt', 'wecombot',
    'discord', 'wxpusher', 'meow',
]);
function normalizePushChannel(input) {
    const channel = String(input.channel ?? '').trim().toLowerCase();
    let endpoint = String(input.endpoint ?? '').trim();
    let token = String(input.token ?? '').trim();
    const secret = String(input.secret ?? '').trim();
    if (channel === 'dingtalk' && token) {
        endpoint ||= /^https?:\/\//i.test(token) ? token : `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(token)}`;
        token = '';
    }
    return { channel, endpoint, token, secret, enabled: input.enabled === true };
}
function isPushChannelConfigured(entry) {
    return Boolean(entry.channel === 'webhook' || entry.channel === 'dingtalk' ? entry.endpoint : entry.token);
}
function readPushChannels(config) {
    // 早期配置把渠道名存放在 endpoint，钉钉则可能只保存了 access token。
    const oldName = String(config.endpoint ?? '').trim().toLowerCase();
    const namedEndpoint = !config.channel && exports.PUSHOO_CHANNELS.has(oldName);
    const entries = Array.isArray(config.channels) ? config.channels : [{
            ...config, channel: config.channel || (namedEndpoint ? oldName : 'webhook'),
            endpoint: namedEndpoint ? '' : config.endpoint, enabled: true,
        }];
    const channels = new Map();
    for (const raw of entries) {
        if (!raw || typeof raw !== 'object')
            continue;
        const entry = normalizePushChannel(raw);
        if (!exports.PUSHOO_CHANNELS.has(entry.channel) || !(entry.endpoint || entry.token || entry.secret))
            continue;
        entry.enabled &&= isPushChannelConfigured(entry);
        channels.set(entry.channel, entry);
    }
    return [...channels.values()];
}
function singlePushChannel(saved, update) {
    const channel = String(update.channel ?? saved.channel).trim().toLowerCase();
    const existing = saved.channels.find(entry => entry.channel === channel);
    return normalizePushChannel({ ...existing, ...update, channel, enabled: update.enabled ?? true });
}
//# sourceMappingURL=push-channels.js.map