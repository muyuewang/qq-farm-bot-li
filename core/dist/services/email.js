"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 邮箱系统 - 自动领取邮箱奖励
 *
 * 邮箱领取属于日常任务：每天在配置的时间点（默认 10:00，可设为 0 点）检查一次。
 * 领取完成、确认没有奖励或检查失败后，当天不再重复触发。
 * 执行途中退出留下的 running 记录不算已完成，重启后重新读取邮箱状态。
 */
const crypto = require('node:crypto');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum, getSystemDateKey, getSystemClockMinutes, getServerTimeSec } = require('../utils/utils');
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFileStrict, writeJsonFileAtomic } = require('./json-db');
const { parseHourOfDay } = require('../utils/hour-of-day');
const DAILY_KEY = 'email_rewards';
const DEFAULT_EMAIL_CLAIM_HOUR = 10;
const STATE_VERSION = 1;
const MINUTES_PER_DAY = 24 * 60;
let claimHour = DEFAULT_EMAIL_CLAIM_HOUR;
let stateAccountId = '';
let attemptedDateKey = '';
let lastCheckAt = 0;
let lastResult = '';
let lastError = '';
let lastClaimed = 0;
let stateLoaded = false;
function normalizeClaimHour(value, fallback = DEFAULT_EMAIL_CLAIM_HOUR) {
    return parseHourOfDay(value) ?? parseHourOfDay(fallback) ?? DEFAULT_EMAIL_CLAIM_HOUR;
}
function getStateFile() {
    if (!stateAccountId)
        return '';
    const token = crypto.createHash('sha256').update(stateAccountId, 'utf8').digest('hex');
    return getDataFile(`email-claim-${token}.json`);
}
function loadState() {
    if (stateLoaded)
        return;
    const file = getStateFile();
    if (!file)
        return;
    const state = readJsonFileStrict(file, () => ({}));
    stateLoaded = true;
    if (!state || Number(state.version) !== STATE_VERSION)
        return;
    const dateKey = String(state.dateKey || '');
    if (dateKey !== getSystemDateKey())
        return;
    attemptedDateKey = dateKey;
    lastCheckAt = Math.max(0, Number(state.attemptedAt) || 0);
    lastResult = String(state.result || '');
    lastError = String(state.lastError || state.error || '');
    lastClaimed = Math.max(0, Number(state.claimed) || 0);
    if (lastResult === 'running') {
        // 上次进程未取得最终结果，恢复为待检查；重新读取后只领取仍可领取的邮件。
        attemptedDateKey = '';
        lastResult = '';
        lastError = '';
        lastClaimed = 0;
    }
}
function persistState() {
    const file = getStateFile();
    if (!file)
        return true;
    try {
        writeJsonFileAtomic(file, {
            version: STATE_VERSION,
            dateKey: attemptedDateKey,
            attemptedAt: lastCheckAt,
            result: lastResult,
            lastError,
            claimed: lastClaimed,
        });
        return true;
    }
    catch {
        // 状态保存失败时由调用方停止本次检查，并展示存储错误。
        return false;
    }
}
function isDoneToday() {
    loadState();
    return attemptedDateKey === getSystemDateKey() && lastResult !== 'running';
}
/** 配置当前账号的邮箱领取时间；切换账号时重新加载该账号的当日状态。 */
function configureEmailClaim(options = {}) {
    if (options.hour !== undefined) {
        claimHour = normalizeClaimHour(options.hour, claimHour);
    }
    if (options.accountId !== undefined) {
        const nextAccountId = String(options.accountId || '');
        if (nextAccountId !== stateAccountId) {
            stateAccountId = nextAccountId;
            attemptedDateKey = '';
            lastCheckAt = 0;
            lastResult = '';
            lastError = '';
            lastClaimed = 0;
            stateLoaded = false;
            loadState();
        }
    }
}
function getEmailClaimHour() {
    return claimHour;
}
/** 判断某个整点小时是否已经到达（按系统配置时区计算）。 */
function isEmailClaimTimeReached(hour, nowMs = getServerTimeSec() * 1000) {
    return getSystemClockMinutes(nowMs) >= normalizeClaimHour(hour) * 60;
}
/** 下一次到达设定时间点的本地时间戳；已经过点则顺延到明天。 */
function getNextScheduledLocalAt(nowMs = Date.now()) {
    const serverNowMs = getServerTimeSec() * 1000;
    const minutesNow = getSystemClockMinutes(serverNowMs);
    let deltaMinutes = claimHour * 60 - minutesNow;
    if (deltaMinutes <= 0)
        deltaMinutes += MINUTES_PER_DAY;
    const secondOfMinute = Math.floor((serverNowMs % 60000) / 1000);
    return nowMs + deltaMinutes * 60000 - secondOfMinute * 1000;
}
function getNextCheckAt() {
    if (!isDoneToday() && isEmailClaimTimeReached(claimHour))
        return 0;
    return getNextScheduledLocalAt();
}
function markAttempted() {
    attemptedDateKey = getSystemDateKey();
    lastCheckAt = Date.now();
    lastResult = 'running';
    lastError = '';
    lastClaimed = 0;
    if (!persistState()) {
        // 本次检查状态无法保存，停止请求并展示错误。
        lastResult = 'error';
        lastError = '无法保存邮箱检查状态';
        return false;
    }
    return true;
}
function finishAttempt(result, error = '', claimed = 0) {
    lastCheckAt = Date.now();
    lastResult = result;
    lastError = error;
    lastClaimed = claimed;
    persistState();
}
/** 仅供测试重置内存状态；不会删除真实账号的落盘文件。 */
function resetEmailClaimStateForTest() {
    claimHour = DEFAULT_EMAIL_CLAIM_HOUR;
    stateAccountId = '';
    attemptedDateKey = '';
    lastCheckAt = 0;
    lastResult = '';
    lastError = '';
    lastClaimed = 0;
    stateLoaded = false;
}
async function getEmailList(boxType = 1) {
    const body = types.GetEmailListRequest.encode(types.GetEmailListRequest.create({
        box_type: normalizeBoxType(boxType),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'GetEmailList', body);
    return types.GetEmailListReply.decode(replyBody);
}
async function claimEmail(boxType = 1, emailId = '') {
    const body = types.ClaimEmailRequest.encode(types.ClaimEmailRequest.create({
        box_type: normalizeBoxType(boxType),
        email_id: String(emailId || ''),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'ClaimEmail', body);
    return types.ClaimEmailReply.decode(replyBody);
}
async function batchClaimEmail(boxType = 1, emailIds = []) {
    const body = types.BatchClaimEmailRequest.encode(types.BatchClaimEmailRequest.create({
        box_type: normalizeBoxType(boxType),
        email_ids: emailIds.map(String).filter(Boolean),
    })).finish();
    // BatchClaimEmail 有正式响应。等待回包后才能把邮件计入已领取，
    // 否则发送成功但网关返回业务错误时会被误判为成功。
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'BatchClaimEmail', body);
    return types.BatchClaimEmailReply.decode(replyBody);
}
function collectClaimableEmails(reply) {
    const emails = (reply && Array.isArray(reply.emails)) ? reply.emails : [];
    return emails.filter((x) => x && x.id && x.has_reward === true && x.claimed !== true);
}
function normalizeBoxType(v) {
    const n = Number(v);
    return (n === 1 || n === 2) ? n : 1;
}
function getRewardSummary(items) {
    const list = Array.isArray(items) ? items : [];
    const summary = [];
    for (const it of list) {
        const id = toNum(it.id);
        const count = toNum(it.count);
        if (count <= 0)
            continue;
        if (id === 1 || id === 1001)
            summary.push(`金币${count}`);
        else if (id === 2 || id === 1101)
            summary.push(`经验${count}`);
        else if (id === 1002)
            summary.push(`点券${count}`);
        else
            summary.push(`物品#${id}x${count}`);
    }
    return summary.join('/');
}
async function checkAndClaimEmails(force = false) {
    if (isDoneToday())
        return { claimed: 0, rewardItems: 0, skipped: 'done' };
    if (lastResult === 'running')
        return { claimed: 0, rewardItems: 0, skipped: 'running' };
    if (!force && !isEmailClaimTimeReached(claimHour))
        return { claimed: 0, rewardItems: 0, skipped: 'waiting' };
    // 先记录执行中，避免并发检查；只有取得最终结果后才结束当天检查。
    if (!markAttempted()) {
        log('邮箱', '无法保存邮箱检查状态，本次跳过以免重复请求', {
            module: 'task',
            event: DAILY_KEY,
            result: 'error',
        });
        return { claimed: 0, rewardItems: 0, skipped: 'storage', error: '无法保存邮箱检查状态' };
    }
    try {
        // 小游戏网关在同一账号上必须串行请求，避免两个邮箱列表请求并发造成回包停滞。
        const failures = [];
        const box1 = await getEmailList(1).catch((e) => { failures.push(e); return { emails: [] }; });
        const box2 = await getEmailList(2).catch((e) => { failures.push(e); return { emails: [] }; });
        const fromBox1 = (box1.emails || []).map((x) => ({ ...x, __boxType: 1 }));
        const fromBox2 = (box2.emails || []).map((x) => ({ ...x, __boxType: 2 }));
        const claimable = collectClaimableEmails({ emails: [...fromBox1, ...fromBox2] });
        if (claimable.length === 0) {
            if (failures.length > 0)
                throw failures[0] || new Error('邮箱列表读取失败');
            finishAttempt('none');
            log('邮箱', '当前暂无可领取邮箱奖励', {
                module: 'task',
                event: DAILY_KEY,
                result: 'none',
            });
            return { claimed: 0, rewardItems: 0 };
        }
        const rewards = [];
        let claimed = 0;
        // 先按邮箱类型尝试批量领取，失败则继续单领
        const byBox = new Map();
        const batchClaimed = new Set();
        for (const m of claimable) {
            const boxType = normalizeBoxType(m && m.__boxType);
            if (!byBox.has(boxType))
                byBox.set(boxType, []);
            byBox.get(boxType).push(m);
        }
        for (const [boxType, list] of byBox.entries()) {
            try {
                const emailIds = list.map((item) => String((item && item.id) || '')).filter(Boolean);
                if (emailIds.length > 0) {
                    await batchClaimEmail(boxType, emailIds);
                    for (const emailId of emailIds)
                        batchClaimed.add(`${boxType}:${emailId}`);
                    claimed += emailIds.length;
                }
            }
            catch {
                // 批量失败静默，继续单领
            }
        }
        for (const m of claimable) {
            const boxType = normalizeBoxType(m && m.__boxType);
            if (batchClaimed.has(`${boxType}:${String(m.id || '')}`))
                continue;
            try {
                const rep = await claimEmail(boxType, String(m.id || ''));
                if (Array.isArray(rep.items) && rep.items.length > 0) {
                    rewards.push(...rep.items);
                }
                claimed += 1;
            }
            catch {
                // 单封失败静默
            }
        }
        if (claimed > 0) {
            const incomplete = claimed < claimable.length || failures.length > 0;
            finishAttempt(incomplete ? 'partial' : 'ok', incomplete ? '部分邮件未能领取' : '', claimed);
            const rewardStr = getRewardSummary(rewards);
            const suffix = incomplete
                ? `（${claimed}/${claimable.length} 封，部分失败）`
                : (rewardStr ? ` → ${rewardStr}` : '');
            log('邮箱', `[邮箱领取] 领取成功 ${claimed} 封${suffix}`, {
                module: 'task',
                event: DAILY_KEY,
                result: incomplete ? 'partial' : 'ok',
                count: claimed,
                total: claimable.length,
                listFailures: failures.length,
            });
        }
        else {
            finishAttempt('error', '本次没有邮件领取成功');
            log('邮箱', '邮箱奖励领取失败：本次没有邮件领取成功', {
                module: 'task',
                event: DAILY_KEY,
                result: 'error',
                count: claimable.length,
            });
        }
        return { claimed, rewardItems: rewards.length };
    }
    catch (e) {
        const message = String(e?.message || e || 'unknown');
        finishAttempt('error', message);
        log('邮箱', `领取邮箱奖励失败: ${message}`, {
            module: 'task',
            event: DAILY_KEY,
            result: 'error',
        });
        return { claimed: 0, rewardItems: 0, error: message };
    }
}
async function batchDeleteEmail(boxType = 1, emailIds = []) {
    const body = types.BatchDeleteEmailRequest.encode(types.BatchDeleteEmailRequest.create({
        box_type: normalizeBoxType(boxType),
        email_ids: emailIds.map(String),
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.emailpb.EmailService', 'BatchDeleteEmail', body);
    return types.BatchDeleteEmailReply.decode(replyBody);
}
module.exports = {
    getEmailList,
    claimEmail,
    batchClaimEmail,
    batchDeleteEmail,
    checkAndClaimEmails,
    configureEmailClaim,
    getEmailClaimHour,
    isEmailClaimTimeReached,
    getEmailDailyState: () => {
        loadState();
        const doneToday = isDoneToday();
        const checkedToday = attemptedDateKey === getSystemDateKey();
        return {
            key: DAILY_KEY,
            doneToday,
            lastCheckAt,
            nextCheckAt: getNextCheckAt(),
            scheduledHour: claimHour,
            // 已结束的结果跨日清除；尚在执行中的检查继续展示 running。
            result: lastResult === 'running' || checkedToday ? lastResult : '',
            lastError: checkedToday ? lastError : '',
            claimed: checkedToday ? lastClaimed : 0,
        };
    },
    resetEmailClaimStateForTest,
};
//# sourceMappingURL=email.js.map