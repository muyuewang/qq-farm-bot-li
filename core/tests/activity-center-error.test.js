const assert = require('node:assert/strict');
const test = require('node:test');

const { activityErrorResponse } = require('../dist/controllers/admin/activity-center-routes');

test('activity errors identify a stale worker instead of returning a generic operation failure', () => {
    assert.deepEqual(activityErrorResponse(new Error('Unknown method')), {
        code: 'WORKER_API_VERSION_MISMATCH',
        message: '账号进程仍在运行旧版本，请重启该账号或服务后重试',
        stage: 'worker.dispatch',
    });
});

test('activity errors identify a stale compiled activity module', () => {
    const error = new TypeError('activity.getCurrentCharityRedFlowerActivity is not a function');
    error.activityStage = 'worker.execute';
    error.activityTraceId = 'activity-legacy-module-1';

    assert.deepEqual(activityErrorResponse(error), {
        code: 'ACTIVITY_MODULE_VERSION_MISMATCH',
        message: '活动服务仍在使用旧构建产物，请重新构建并完整重启服务及账号',
        stage: 'worker.execute',
        traceId: 'activity-legacy-module-1',
    });
});

test('activity errors retain an unknown gateway status and its safe server message', () => {
    const error = new Error('gamepb.activitypb.ActivityService.List 错误: code=1099999 服务暂不可用');
    error.code = 1099999;
    error.errorMessage = '服务暂不可用';
    error.activityStage = 'activity.list.request';
    error.activityTraceId = 'charity-7';

    assert.deepEqual(activityErrorResponse(error), {
        code: '1099999',
        message: '活动服务返回错误 1099999：服务暂不可用',
        stage: 'activity.list.request',
        traceId: 'charity-7',
    });
});

test('missing charity state is reported as a load failure rather than missing authorization', () => {
    const error = new Error('活动列表存在公益小红花入口，但未返回活动动态状态');
    error.code = 'CHARITY_RED_FLOWER_STATE_MISSING';
    error.activityStage = 'charity.state.find';

    assert.deepEqual(activityErrorResponse(error), {
        code: 'CHARITY_RED_FLOWER_STATE_MISSING',
        message: '已发现公益小红花入口，但活动详情读取失败；请刷新或重启账号后重试',
        stage: 'charity.state.find',
    });
});
