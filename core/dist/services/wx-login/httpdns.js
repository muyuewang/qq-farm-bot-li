"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DNS_ENDPOINT = 'http://aedns.weixin.qq.com/cgi-bin/default/getdns';
/** 与 native-protocol 的客户端版本号一致；传 0 时服务端可能返回空列表。 */
const DNS_CLIENT_VERSION = 524545;
const DNS_TIMEOUT_MS = 3000;
const DNS_CACHE_TTL_MS = 10 * 60_000;
/** 长链是裸 TCP 上的 mmtls 记录，443 常见且最容易被代理放行。 */
const LONG_PORTS = [443, 8080, 80, 5000];
/** 短链走明文 HTTP（带 Upgrade: mmtls），443 需要 TLS 握手，本实现不走 TLS。 */
const SHORT_PORTS = [80, 8080];
const LONG_PROTOCOLS = ['mmtlsovertcp', 'mmtls'];
const SHORT_PROTOCOLS = ['mmtlsoverhttp', 'http'];
const LONG_DOMAIN = 'longcloud.weixin.com';
const SHORT_DOMAIN = 'shortcloud.weixin.com';
/** 域名直连槽位：DNS 全挂时仍能靠系统 DNS / 代理解析出地址。 */
const LONG_DIRECT = { host: LONG_DOMAIN, port: 443, source: 'direct' };
const SHORT_DIRECT = { host: SHORT_DOMAIN, port: 80, source: 'direct' };
/** 硬编码兜底：只在 DNS 解析失败时使用，都是当前可达的接入点。 */
const LONG_FALLBACK_IPS = ['180.153.202.85'];
const SHORT_FALLBACK_IPS = ['116.128.171.253', '140.207.120.146', '182.50.15.223', '182.50.15.171'];
const cache = new Map();
function buildQuery() {
    const params = new URLSearchParams({
        clientversion: String(DNS_CLIENT_VERSION),
        devicetype: 'Windows',
        uin: '0',
        format: 'json',
    });
    return `${DNS_ENDPOINT}?${params.toString()}`;
}
function portListOf(protocol) {
    const raw = Array.isArray(protocol?.portlist) ? protocol.portlist : [];
    return raw.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
}
/**
 * 只保留「我们真的会用的端口」。
 *
 * 短链是明文 HTTP + `Upgrade: mmtls`，不支持 TLS，所以 443 这类端口必须直接
 * 排除——否则会白等到 8 秒超时才失败。声明表里出现的新端口在偏好表补齐之前
 * 一律不用，宁可回落到偏好表的第一个。
 */
function pickPorts(declared, preferred) {
    const available = new Set(declared);
    const ordered = preferred.filter((port) => available.has(port));
    return ordered.length ? ordered : preferred.slice(0, 1);
}
/**
 * 把 getdns 的返回摊成候选列表。
 *
 * 顺序很重要：先按协议偏好（长链 mmtlsovertcp / 短链 mmtlsoverhttp），
 * 再按端口偏好（长链 443 优先），同一端口下铺开所有 IP。
 * 旧实现是「按 DNS 返回顺序取前 N 个」，在多协议、多端口时容易全部落到不可用组合上。
 */
function parseDnsTargets(payload, kind) {
    const domain = kind === 'long' ? LONG_DOMAIN : SHORT_DOMAIN;
    const protocols = kind === 'long' ? LONG_PROTOCOLS : SHORT_PROTOCOLS;
    const portOrder = kind === 'long' ? LONG_PORTS : SHORT_PORTS;
    const list = Array.isArray(payload?.dns?.domainlist) ? payload.dns.domainlist : [];
    const item = list.find((entry) => String(entry?.name || '') === domain);
    if (!item)
        return [];
    const ips = (Array.isArray(item.iplist) ? item.iplist : [])
        .map((entry) => String(entry?.ip || '').trim())
        .filter(Boolean);
    if (!ips.length)
        return [];
    const declared = Array.isArray(item.protocollist) ? item.protocollist : [];
    const ordered = protocols
        .map((name) => declared.find((entry) => String(entry?.name || '') === name))
        .filter(Boolean);
    // 偏好协议一个都没有时退回「所有声明了端口的协议」，总比空列表强。
    const usable = ordered.length ? ordered : declared.filter((entry) => portListOf(entry).length);
    const out = [];
    for (const protocol of usable) {
        for (const port of pickPorts(portListOf(protocol), portOrder)) {
            for (const host of ips)
                out.push({ host, port, source: 'dns' });
        }
    }
    // 多个协议常常声明同一个端口（短链的 mmtlsoverhttp 与 http 都是 80），要去重。
    return dedupe(out);
}
function dedupe(targets) {
    const seen = new Set();
    const out = [];
    for (const target of targets) {
        const key = `${target.host}:${target.port}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(target);
    }
    return out;
}
function fallbackTargets(kind) {
    const ips = kind === 'long' ? LONG_FALLBACK_IPS : SHORT_FALLBACK_IPS;
    const port = kind === 'long' ? 8080 : 80;
    return ips.map((host) => ({ host, port, source: 'fallback' }));
}
/**
 * 解析某一类接入点。永远返回非空列表：DNS 失败时依次退到
 * 域名直连槽位与硬编码 IP，不会让调用方拿到空数组后无从连接。
 */
async function resolveTargets(kind, options = {}) {
    const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
    const cached = cache.get(kind);
    if (!options.bypassCache && cached && now - cached.at < DNS_CACHE_TTL_MS)
        return cached.targets.slice();
    const direct = kind === 'long' ? LONG_DIRECT : SHORT_DIRECT;
    const fetched = await fetchDns(kind, options);
    const merged = dedupe([...fetched, direct, ...fallbackTargets(kind)]);
    cache.set(kind, { at: now, targets: merged });
    return merged.slice();
}
async function fetchDns(kind, options) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return [];
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DNS_TIMEOUT_MS;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetchImpl(buildQuery(), {
            headers: { 'User-Agent': 'MicroMessenger Client' },
            signal: controller ? controller.signal : undefined,
        });
        if (!response || !response.ok)
            return [];
        const payload = await response.json();
        return parseDnsTargets(payload, kind);
    }
    catch {
        // DNS 只是「更好的候选」，失败不影响主流程，由兜底槽位接手。
        return [];
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** 仅供测试：清空 DNS 结果缓存。 */
function clearDnsCache() {
    cache.clear();
}
module.exports = {
    DNS_ENDPOINT,
    DNS_CLIENT_VERSION,
    DNS_CACHE_TTL_MS,
    LONG_PORTS,
    SHORT_PORTS,
    LONG_DOMAIN,
    SHORT_DOMAIN,
    LONG_FALLBACK_IPS,
    SHORT_FALLBACK_IPS,
    parseDnsTargets,
    resolveTargets,
    clearDnsCache,
};
//# sourceMappingURL=httpdns.js.map