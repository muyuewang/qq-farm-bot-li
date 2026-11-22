"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('node:fs');
const path = require('node:path');
const isPackaged = !!process.pkg;
function getResourceRoot() {
    const parent = path.join(__dirname, '..');
    // 编译和打包后仍从 src 读取协议、配置和 WASM 等静态资源。
    if (path.basename(parent) === 'dist')
        return path.join(parent, '..', 'src');
    return parent;
}
function getResourcePath(...segments) {
    return path.join(getResourceRoot(), ...segments);
}
function getAppRootForWritable() {
    return isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '../..');
}
function getDataDir() {
    return path.join(getAppRootForWritable(), 'data');
}
function ensureDataDir() {
    const dir = getDataDir();
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function getDataFile(filename) {
    return path.join(getDataDir(), filename);
}
function getShareFilePath() {
    return path.join(getAppRootForWritable(), 'share.txt');
}
module.exports = {
    isPackaged,
    getResourcePath,
    getDataDir,
    getDataFile,
    ensureDataDir,
    getShareFilePath,
};
//# sourceMappingURL=runtime-paths.js.map