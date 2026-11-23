"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 后端「免扫码自动续期」的可观测账本（持久化）。
 *
 * 目的：让用户不用翻日志就能确认「关掉网页 24 小时，后端到底有没有在自动续期」。
 * wx-keepalive 的 createPreflightGovernor() 是进程内的限速 / 熔断状态机，容器
 * 一重启就清零，不适合拿来展示历史结果；这里单独记一份按账号维度的账，落在
 * /app/core/data 命名卷里，重新部署容器也不会丢。
 *
 * 口径（与面板文案保持一致）：
 * - 只统计「后端自动发起」的微信凭证续期：到期前预防性续期（preflight，常开）
 *   和掉线自动重登（offline）；用户手动点「续期全部微信授权」不计入。
 * - 成功 / 失败次数按 UTC+8 自然日归零；lastSuccessAt / lastFailureAt 跨日保留，
 *   这样第二天早上仍能看到「上次自动续期是几小时前」。
 * - 只写时间戳与计数，不写任何 token / code，也不写接口原始错误文本，
 *   因此可以直接随 /api/accounts 下发给浏览器。
 *
 * 读写全部包 try/catch：账本落盘失败绝不能影响续期主流程。
 */
const fs = require('node:fs');
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFileStrict, writeJsonFileAtomic } = require('./json-db');
const DEFAULT_FILE = getDataFile('preflight-stats.json');
const UTC8_OFFSET_MS = 8 * 3600_000;
/** UTC+8 自然日：与 createPreflightGovernor 的换日口径完全一致。 */
function utc8Date(now) {
    return new Date(now + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}
function emptyStats() {
    return { lastSuccessAt: 0, lastFailureAt: 0, successesToday: 0, failuresToday: 0 };
}
function safeCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function safeTimestamp(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}
/** 读进来的文件可能是旧版 / 脏数据：逐字段收敛，避免 NaN 或负数污染面板。 */
function normalize(raw, date) {
    const source = (raw && typeof raw === 'object') ? raw : {};
    const accounts = {};
    const entries = (source.accounts && typeof source.accounts === 'object') ? source.accounts : {};
    for (const [id, value] of Object.entries(entries)) {
        if (!value || typeof value !== 'object')
            continue;
        const sameDay = source.date === date;
        accounts[String(id)] = {
            lastSuccessAt: safeTimestamp(value.lastSuccessAt),
            lastFailureAt: safeTimestamp(value.lastFailureAt),
            successesToday: sameDay ? safeCount(value.successesToday) : 0,
            failuresToday: sameDay ? safeCount(value.failuresToday) : 0,
        };
    }
    return { date, accounts };
}
function createPreflightStats(options = {}) {
    const filePath = options.filePath || DEFAULT_FILE;
    const nowFn = options.nowFn || Date.now;
    // 必须用 strict 版：宽松版把「文件不存在」「JSON 损坏」「权限错误」都返回同一个 fallback，
    // 调用方无法区分。一旦把损坏当成空账本，紧接着的一次 persist 就会用空表覆盖原文件，
    // 全部账号的 lastSuccessAt / 当日计数永久丢失，日志里还不留痕迹。
    const readJson = options.readJson || readJsonFileStrict;
    const writeJson = options.writeJson || writeJsonFileAtomic;
    let state = null;
    /** 账本文件损坏时先留档，避免后续 persist 用空表把唯一副本覆盖掉。 */
    function quarantineCorruptFile() {
        try {
            const backup = `${filePath}.corrupt-${Date.now()}`;
            fs.renameSync(filePath, backup);
            // eslint-disable-next-line no-console
            console.warn(`[续期账本] 文件损坏，已另存为 ${backup} 并重新开始记录`);
        }
        catch {
            // 留档失败只能放弃（例如目录只读），至少不阻断续期主流程
        }
    }
    function load(now) {
        if (!state) {
            let raw = null;
            try {
                raw = readJson(filePath, () => ({}));
            }
            catch {
                quarantineCorruptFile();
                raw = null;
            }
            state = normalize(raw, utc8Date(now));
        }
        return state;
    }
    /** 跨 UTC+8 自然日：当日计数归零，但保留历史时间戳。读操作不写盘。 */
    function rollOver(now) {
        const current = load(now);
        const date = utc8Date(now);
        if (current.date === date)
            return current;
        for (const stats of Object.values(current.accounts)) {
            stats.successesToday = 0;
            stats.failuresToday = 0;
        }
        current.date = date;
        return current;
    }
    function persist() {
        if (!state)
            return;
        try {
            writeJson(filePath, state);
        }
        catch {
            // 账本只是可观测数据，落盘失败不影响续期；下次成功 / 失败会再写一次。
        }
    }
    function entryOf(accountId, now) {
        const current = rollOver(now);
        const id = String(accountId ?? '');
        if (!id)
            return emptyStats();
        if (!current.accounts[id])
            current.accounts[id] = emptyStats();
        return current.accounts[id];
    }
    return {
        /** 后端自动续期成功。只记时间与次数，绝不写 token / code。 */
        recordSuccess(accountId, now = nowFn()) {
            const stats = entryOf(accountId, now);
            stats.lastSuccessAt = now;
            stats.successesToday += 1;
            persist();
        },
        /** 后端自动续期失败。不接收错误文本，避免把接口原始信息带进浏览器。 */
        recordFailure(accountId, now = nowFn()) {
            const stats = entryOf(accountId, now);
            stats.lastFailureAt = now;
            stats.failuresToday += 1;
            persist();
        },
        /** 单账号统计；没有记录的账号返回全 0，前端显示「暂无记录」而不是报错。 */
        get(accountId, now = nowFn()) {
            const current = rollOver(now);
            return {
                date: current.date,
                ...(current.accounts[String(accountId ?? '')] || emptyStats()),
            };
        },
        /** 列表接口一次取全量，避免每个账号单独读盘。 */
        snapshot(now = nowFn()) {
            const current = rollOver(now);
            const result = {};
            for (const [id, stats] of Object.entries(current.accounts)) {
                result[id] = { date: current.date, ...stats };
            }
            return result;
        },
        /** 仅测试用：丢弃内存快照，下次操作重新读文件。 */
        reset() { state = null; },
    };
}
const store = createPreflightStats();
function recordAutoRefreshSuccess(accountId, now) {
    store.recordSuccess(accountId, now);
}
function recordAutoRefreshFailure(accountId, now) {
    store.recordFailure(accountId, now);
}
function getPreflightStats(accountId, now) {
    return store.get(accountId, now);
}
function getPreflightStatsSnapshot(now) {
    return store.snapshot(now);
}
module.exports = {
    DEFAULT_FILE,
    utc8Date,
    createPreflightStats,
    recordAutoRefreshSuccess,
    recordAutoRefreshFailure,
    getPreflightStats,
    getPreflightStatsSnapshot,
};
//# sourceMappingURL=preflight-stats.js.map