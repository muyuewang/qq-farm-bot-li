export {};
/**
 * 微信 mmtls 的 HTTPDNS 站点发现。
 *
 * 移植 YYB-Go-Enhanced 的 internal/protocol/newdns.go。原来的实现有几个已经
 * 失效或次优的地方，单看代码不会报错，但一旦走到兜底分支就是「彻底连不上、
 * 只能重启」：
 *
 *   1. 短链 fallback IP `120.241.131.173:80` 已被微信下线；
 *   2. 短链协议只认 `http`，而当前后端用的是 `mmtlsoverhttp`（走代理只放行新名）；
 *   3. DNS 查询的 clientversion 传 0，服务端可能返回空列表；
 *   4. 长链按 DNS 返回顺序取端口，而部分代理只放行 443，需要显式优先；
 *   5. 没有「域名直连」兜底槽位，DNS 全挂时无路可走。
 *
 * 这里只负责「给出候选列表」，连接与重试仍由 native-protocol 决定。
 */
export interface DnsTarget {
    host: string;
    port: number;
    source: 'dns' | 'direct' | 'fallback';
}
export interface ResolveOptions {
    now?: number;
    fetchImpl?: any;
    bypassCache?: boolean;
    timeoutMs?: number;
}
//# sourceMappingURL=httpdns.d.ts.map