export {};
/**
 * 内核层 socket 队列读数（只读，不参与任何判定）。
 *
 * 为什么需要：`ws._socket` 在 wss 下是 TLSSocket，它的 bytesRead/bytesWritten 数的是解密后的
 * 明文字节。静默窗口里「read 不动」只能证明 TLS 没向上交出过字节，分不开服务端停写、下行密文
 * 被丢、内核还在替我们重传这三种死法。`/proc/net/tcp` 里这条四元组的 tx_queue / rx_queue 是内核对
 * 「未确认的发送数据」和「已收到但还没被读走的数据」的记账，正好能把三者分开。
 */
const fs = require('node:fs');

const PROC_TCP_FILES = [ '/proc/net/tcp', '/proc/net/tcp6' ];

interface QueueMatch {
    localPort: number;
    remotePort: number;
    remoteAddress: string;
}

function hexIpv4ToDotted(hex: string): string {
    const value = parseInt(hex, 16);
    return [ value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255 ].join('.');
}

/** 在一段 /proc/net/tcp 文本里按四元组找队列长度；找不到返回 null。 */
function parseSocketQueues(text: string, match: QueueMatch): Record<string, number> | null {
    const lines = String(text || '').split('\n');
    for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].trim().split(/\s+/);
        if (fields.length < 10) continue;
        const local = String(fields[1]).split(':');
        const remote = String(fields[2]).split(':');
        if (parseInt(local[1], 16) !== match.localPort) continue;
        if (parseInt(remote[1], 16) !== match.remotePort) continue;
        // tcp6 的地址是 32 位十六进制，没法和点分地址比，只能靠端口匹配。
        if (remote[0].length === 8 && match.remoteAddress && hexIpv4ToDotted(remote[0]) !== match.remoteAddress) continue;
        const queues = String(fields[4]).split(':');
        return { txQueue: parseInt(queues[0], 16) || 0, rxQueue: parseInt(queues[1], 16) || 0 };
    }
    return null;
}

/** 读内核队列；非 Linux、无权限或连接已不在表里时返回 null。 */
function readSocketQueues(localPort: number, remotePort: number, remoteAddress: string): Record<string, number> | null {
    const match: QueueMatch = {
        localPort: Number(localPort) || 0,
        remotePort: Number(remotePort) || 0,
        remoteAddress: String(remoteAddress || ''),
    };
    if (!match.localPort || !match.remotePort) return null;
    for (const path of PROC_TCP_FILES) {
        try {
            const hit = parseSocketQueues(fs.readFileSync(path, 'utf8'), match);
            if (hit) return hit;
        } catch {
            // 读不到就当没有，诊断行少两个字段不影响任何逻辑。
        }
    }
    return null;
}

module.exports = { readSocketQueues, parseSocketQueues, hexIpv4ToDotted };
