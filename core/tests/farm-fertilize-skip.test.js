const assert = require('node:assert/strict');
const test = require('node:test');

const networkPath = require.resolve('../dist/utils/network');
const protoPath = require.resolve('../dist/utils/proto');
const utilsPath = require.resolve('../dist/utils/utils');

const outcomes = [];

require.cache[networkPath] = {
    exports: {
        sendMsgAsync: async () => {
            const next = outcomes.shift();
            if (!next) return {};
            return next();
        },
        getUserState: () => ({ gid: 1 }),
    },
};
require.cache[protoPath] = {
    exports: {
        types: {
            FertilizeRequest: {
                create: value => value,
                encode: () => ({ finish: () => Buffer.alloc(0) }),
            },
        },
    },
};
require.cache[utilsPath] = {
    exports: {
        toLong: value => value,
        toNum: value => Number(value) || 0,
        sleep: async () => {},
        randomDelay: async () => {},
        log: () => {},
        logWarn: () => {},
    },
};

const { fertilize, isSkippableFertilizeLandError, isFertilizerContainerEmpty, NORMAL_FERTILIZER_ID } = require('../dist/services/farm/api');

const containerEmptyError = () => {
    const error = new Error('PlantService.Fertilize 错误: code=1000019 普通化肥容器不足');
    error.code = 1000019;
    throw error;
};

test('isSkippableFertilizeLandError recognizes per-land fertilize rejects', () => {
    assert.equal(isSkippableFertilizeLandError({ code: 1001024 }), true);
    assert.equal(isSkippableFertilizeLandError({ code: 1001025, message: '之前阶段已使用了该化肥' }), true);
    assert.equal(isSkippableFertilizeLandError(new Error('PlantService.Fertilize 错误: code=1001025 之前阶段已使用了该化肥')), true);
    assert.equal(isSkippableFertilizeLandError(new Error('code=1000019 肥料不足')), false);
    assert.equal(isSkippableFertilizeLandError(new Error('network down')), false);
});

test('fertilize skips 1001025 lands and continues, then stops on other errors', async () => {
    outcomes.push(
        () => {
            const error = new Error('PlantService.Fertilize 错误: code=1001025 之前阶段已使用了该化肥');
            error.code = 1001025;
            throw error;
        },
        () => ({}),
        () => {
            const error = new Error('PlantService.Fertilize 错误: code=1001024 当前阶段不可施肥');
            error.code = 1001024;
            throw error;
        },
        () => ({}),
        () => {
            throw new Error('PlantService.Fertilize 错误: code=1000019 肥料不足');
        },
        () => ({}),
    );

    const count = await fertilize([1, 2, 3, 4, 5, 6], 1011, false);
    assert.equal(count, 2);
    assert.equal(outcomes.length, 1);
    assert.equal(isFertilizerContainerEmpty(1011), false, '肥料不足的文案不该记成容器为空');
});

test('普通化肥容器不足会记住结论，施成功或到期后解除', async () => {
    outcomes.length = 0;
    outcomes.push(containerEmptyError);
    assert.equal(await fertilize([11], NORMAL_FERTILIZER_ID, false), 0);
    assert.equal(isFertilizerContainerEmpty(NORMAL_FERTILIZER_ID), true);

    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;
    try {
        assert.equal(isFertilizerContainerEmpty(NORMAL_FERTILIZER_ID), false, '超过 5 分钟要重新试探');
    } finally {
        Date.now = realNow;
    }

    outcomes.push(containerEmptyError);
    await assert.rejects(() => fertilize([12], NORMAL_FERTILIZER_ID, true), /容器不足/);
    assert.equal(isFertilizerContainerEmpty(NORMAL_FERTILIZER_ID), true, '手动路径抛出前也要记住结论');

    outcomes.push(() => ({}));
    assert.equal(await fertilize([13], NORMAL_FERTILIZER_ID, false), 1);
    assert.equal(isFertilizerContainerEmpty(NORMAL_FERTILIZER_ID), false, '任一块施成功即解除');
});
