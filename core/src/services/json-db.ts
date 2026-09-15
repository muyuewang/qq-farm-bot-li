export {};
const fs = require('node:fs');
const path = require('node:path');
function ensureParentDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readTextFile(filePath: string, fallback = ''): string {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return fallback;
    }
}

function readJsonFile(filePath: string, fallbackFactory: () => any = () => ({})): any {
    const fallback = typeof fallbackFactory === 'function' ? fallbackFactory() : (fallbackFactory || {});
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJsonFileAtomic(filePath: string, data: any, space = 2): void {
    const json = JSON.stringify(data, null, space);
    writeTextFileAtomic(filePath, json);
}

function writeTextFileAtomic(filePath: string, text = ''): void {
    ensureParentDir(filePath);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
        fs.writeFileSync(tmpPath, String(text), 'utf8');
        fs.renameSync(tmpPath, filePath);
    } finally {
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
            // ignore cleanup errors
        }
    }
}

module.exports = {
    readTextFile,
    readJsonFile,
    writeTextFileAtomic,
    writeJsonFileAtomic,
};
