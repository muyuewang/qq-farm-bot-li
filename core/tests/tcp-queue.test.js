const assert = require('node:assert/strict');
const test = require('node:test');

const {
    readSocketQueues,
    parseSocketQueues,
    hexIpv4ToDotted,
} = require('../dist/utils/tcp-queue');

// 一行真实的 /proc/net/tcp 记录：本地 10.0.0.5:52130 ↔ 122.192.37.6:443，tx=0、rx=512
const HEADER = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode';
const V4_LINE = '   0: 0500000A:CBA2 0625C07A:01BB 01 00000000:00000200 00:00000000 00000000  1000        0 1234567 2 0000000000000000 100 0 0 10 0';
const V6_LINE = '   1: 00000000000000000000000001000000:CBA3 00000000000000000000000001000000:01BB 01 00000064:00000000 00:00000000 00000000  1000        0 7654321 2 0000000000000000 100 0 0 10 0';

test('地址按小端十六进制还原成点分地址', () => {
    assert.equal(hexIpv4ToDotted('0625C07A'), '122.192.37.6');
    assert.equal(hexIpv4ToDotted('0500000A'), '10.0.0.5');
});

test('四元组命中时读出内核记账的 tx/rx 队列', () => {
    const hit = parseSocketQueues(`${HEADER}\n${V4_LINE}`, {
        localPort: 52130, remotePort: 443, remoteAddress: '122.192.37.6',
    });
    assert.deepEqual(hit, { txQueue: 0, rxQueue: 512 });
});

test('远端地址对不上不算命中：端口撞了也不能认错连接', () => {
    const miss = parseSocketQueues(`${HEADER}\n${V4_LINE}`, {
        localPort: 52130, remotePort: 443, remoteAddress: '101.35.200.1',
    });
    assert.equal(miss, null);
});

test('tcp6 记录无法比地址，按端口命中', () => {
    const hit = parseSocketQueues(`${HEADER}\n${V6_LINE}`, {
        localPort: 52131, remotePort: 443, remoteAddress: '::1',
    });
    assert.deepEqual(hit, { txQueue: 100, rxQueue: 0 });
});

test('端口未知（拿不到 localPort）时不去读表', () => {
    assert.equal(readSocketQueues(0, 443, '122.192.37.6'), null);
    assert.equal(readSocketQueues(52130, 0, '122.192.37.6'), null);
});

test('非 Linux 或表里没有这条连接时降级为 null，不抛错', () => {
    assert.equal(readSocketQueues(65001, 65002, '203.0.113.9'), null);
});
