"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('node:fs');
const path = require('node:path');
const { resolveRuntimePaths, resolveWebRootInfo } = require('@qq-farm-bot/session-contract');
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
function getRuntimePaths() {
    const appRoot = getAppRootForWritable();
    return resolveRuntimePaths({
        appRoot,
        isPackaged,
        defaultRuntimeDir: isPackaged ? path.join(appRoot, 'runtime') : path.resolve(appRoot, '../runtime'),
        defaultResourceRoot: getResourceRoot(),
        defaultWebRoot: path.resolve(__dirname, '../../../web/dist'),
    });
}
function getWebRootInfo() {
    return resolveWebRootInfo(getRuntimePaths().runtimeDir, path.resolve(__dirname, '../../../web/dist'));
}
function getDataDir() {
    return process.env.FARM_DATA_DIR ? path.resolve(process.env.FARM_DATA_DIR) : path.join(getAppRootForWritable(), 'data');
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
    return getRuntimePaths().shareFilePath;
}
module.exports = {
    isPackaged,
    getResourcePath,
    getRuntimePaths,
    getWebRootInfo,
    getDataDir,
    getDataFile,
    ensureDataDir,
    getShareFilePath,
};
//# sourceMappingURL=runtime-paths.js.map