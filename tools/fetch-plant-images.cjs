#!/usr/bin/env node
/**
 * 按需补齐作物阶段贴图（默认不随仓库分发，约 31MB）。
 *
 * 数据来源：core/src/gameConfig/plant_images/milk-tea-phase-sources.json
 * 每条 item 记录 file（相对目录）与 sourceUrl（官方 CDN 地址）+ sha256。
 * 本脚本只下载本地缺失的文件，已存在且校验通过的直接跳过。
 *
 *   node tools/fetch-plant-images.cjs           # 补齐缺失文件
 *   node tools/fetch-plant-images.cjs --force   # 重下并校验全部条目
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'core', 'src', 'gameConfig', 'plant_images');
const SOURCES = path.join(DIR, 'milk-tea-phase-sources.json');
const CONCURRENCY = 4;
const force = process.argv.includes('--force');

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function download(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('redirect too many'));
        https.get(url, { headers: { 'user-agent': 'qq-farm-bot/plant-images' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(download(new URL(res.headers.location, url).href, redirects + 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    if (!fs.existsSync(SOURCES)) {
        console.error(`找不到来源清单: ${SOURCES}`);
        process.exit(1);
    }
    const { items = [] } = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
    const queue = items.filter(item => item && item.file && item.sourceUrl);
    console.log(`来源清单 ${items.length} 条，可下载 ${queue.length} 条，并发 ${CONCURRENCY}`);

    let done = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];

    async function worker() {
        while (queue.length > 0) {
            const item = queue.shift();
            const target = path.join(DIR, item.file);
            try {
                if (!force && fs.existsSync(target)) {
                    const buf = fs.readFileSync(target);
                    if (!item.sha256 || sha256(buf) === item.sha256) {
                        skipped += 1;
                        continue;
                    }
                }
                const buf = await download(item.sourceUrl);
                if (item.sha256 && sha256(buf) !== item.sha256) {
                    throw new Error('sha256 mismatch');
                }
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(target, buf);
                done += 1;
                if ((done + skipped) % 20 === 0) console.log(`  进度 ${done + skipped}/${queue.length + done + skipped}`);
            } catch (e) {
                failed += 1;
                failures.push(`${item.file}: ${e.message}`);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    console.log(`完成：下载 ${done}，已存在 ${skipped}，失败 ${failed}`);
    if (failures.length > 0) {
        console.log('失败明细：');
        for (const line of failures.slice(0, 20)) console.log(`  ${line}`);
        if (failures.length > 20) console.log(`  ...共 ${failures.length} 条`);
    }
    const remaining = items.filter(item => item.file && !fs.existsSync(path.join(DIR, item.file))).length;
    if (remaining > 0) {
        console.log(`提示：仍有 ${remaining} 张阶段图无 CDN 来源记录（需从 Spine 渲染），缺失时前端回落到种子图。`);
    }
}

main().catch(e => {
    console.error('执行失败:', e.message);
    process.exit(1);
});
