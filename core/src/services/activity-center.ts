export {};
/**
 * 活动中心兼容入口。
 *
 * 该服务已从单文件迁移到 activity-center/ 目录。保留同名转发文件可以覆盖增量
 * TypeScript 构建遗留的旧 dist/services/activity-center.js，并兼容历史引用路径。
 */

module.exports = require('./activity-center/index');
