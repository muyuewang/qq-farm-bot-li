# 网络并发模型：请求班次与优先级分层

Gateway 是一条 WebSocket 长连接，所有业务共用它。这份文档说明请求怎么排队、谁能插队、谁必须让路。

实现分三块：

- `core/src/utils/request-priority.ts` — 纯策略：班次定义、容量上限、调度选择函数。可单测，不碰任何运行时状态。
- `core/src/utils/request-context.ts` — `AsyncLocalStorage`：给「任务入口」打班次标记，任务内部发的请求自动继承。
- `core/src/utils/network.ts` — 排队与发送：`sendMsgAsync()` 解析班次、`takeDispatchableRequest()` 委托策略函数选下一个请求。

## 为什么要分层

以前只有 `low` / `normal` / `high` 三档，心跳和 ACE 是 `high`，其余全是 `normal`。问题是「其余」里既有用户在面板上点的操作，也有农场定时任务、好友巡查、宠物同步：

- 后台任务一开跑就把 `normal` 的 2 个并发槽占满，用户点一下要等好几秒；
- 好友巡查一轮几百个 `Enter`/`Leave` 全排在同一个队列里，队列和 `pending` 双双拉满；
- 服务端一旦变慢（请求挂十几秒不回包），队列只会越堆越长，最后连心跳都排不上，连续 5 次漏心跳加 30 秒无入站才下线。

## 五个班次

优先级从高到低：

| 班次 | 用途 | 在途上限 | 排队上限 |
| --- | --- | --- | --- |
| `critical` | 心跳、ACE AntiData | 2（两条通道各留 1 个专属槽位） | 8 |
| `foreground` | 用户在面板上的前台操作 | 3 | 60 |
| `farm` | 自己农场的后台定时任务 | 1 | 40 |
| `friend` | 好友农场的后台定时任务 | 1 | 30 |
| `background` | 宠物同步等补数据任务 | 1（且只在连接彻底空闲时） | 10 |

额外约束：

- 业务班次（`foreground` / `farm` / `friend`）总在途不超过 `MAX_BUSINESS_IN_FLIGHT = 3`；
- 其中非前台业务不超过 `MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT = 1`，后台定时任务最多占用一个业务槽位，前台操作至少保留两个可用槽位；
- 只要队列里还有前台请求，新的 `farm` / `friend` 请求就不会派发；已经在途的后台请求无法撤销，但它返回后的下一步会等待前台队列清空；
- `critical` 的两条通道各有一个专属槽位，ACE 挤不掉心跳，反之亦然；
- `background` 只在「没有任何在途请求、且队列里没有别的班次」时才发送——它是补数据，不是业务；
- 排队上限按班次独立计算：后台把自己的 10 个名额排满，也不影响心跳和前台的名额。

所以任何时刻最多 5 个业务/保命请求在飞（2 critical + 3 business），加上空闲时可能有的 1 个 background。

## 防饿死

严格按班次排序会让低优先班次在高优先班次不断到来时永远排不上。`selectDispatchIndex()` 的做法是：排队超过 `CLASS_STARVATION_MS = 4000` 的业务请求会被提升到队首（在同样满足容量约束的候选里挑等待最久的那个）。这个提升不会越过前台请求——只要队列里还有前台请求，新的后台业务请求就不会派发。

## 班次是怎么定下来的

`resolveRequestClass(options, ambientClass)` 的判定顺序：

1. `criticalLane`（`heartbeat` / `ace`）或 `priority: 'high'` → `critical`；
2. 显式 `requestClass` → 用它；
3. `priority: 'low'` → `background`（兼容旧调用）；
4. `AsyncLocalStorage` 里的环境班次 → 用它；
5. 都没有 → `foreground`。

**`priority: 'normal'` 被视为「调用方没表态」，走第 4 步。** 这一点很关键：项目里大量 API 封装（`friend/api.ts`、`friend/gid-manager.ts`、`services/interact.ts` 等）默认传 `'normal'`，如果把它当成明确的前台声明，后台定时任务发的请求就会全部伪装成前台流量，分层等于没做。

环境班次由 `services/scheduler.ts` 注入：`createScheduler(namespace)` 创建的定时器，任务体整体跑在 `classForSchedulerNamespace(namespace)` 里。

| 调度器命名空间 | 班次 |
| --- | --- |
| `network` / `ace` / `worker_manager` | 不注入（这些请求自己声明 `criticalLane`） |
| `friend-pet-sync` | `background` |
| 其它 `friend*`（`friend`、`friend-pet-cache`） | `friend` |
| 其它（`worker`、`farm`、`task`） | `farm` |

`worker` 命名空间的统一 tick 同时驱动农场和好友两种任务，所以三个真正的入口各自再显式包一层：

- `core/src/core/worker.ts` 的 `runFarmTick()` → `runWithRequestClass('farm', ...)`
- `core/src/core/worker.ts` 的 `runFriendTick()` → `runWithRequestClass('friend', ...)`
- `core/src/services/friend/pet-sync.ts` 的 `runFriendPetSync()` → `runWithRequestClass('background', ...)`

面板 HTTP 请求和 Socket.IO 事件不经过调度器，没有环境班次，因此天然落到 `foreground`——那边确实有人在等结果。

## 后台任务的两道闸门

协议层的 `background` 槽位只保证「不抢先」，不保证「不叠加」。所以后台任务自己还要主动让路：

- `waitForGatewayIdle(maxWaitMs)`（`utils/network.ts`）——发请求之前先观察网关，等不到空闲就整轮让路。只观察不排队，等待期间一点压力都不加。判定口径在 `utils/low-priority-gate.ts` 的 `isGatewayIdleForLowPriority()`：队列里有非 `background` 请求、有业务请求在飞、已经有 `background` 在飞、心跳漏过一次、或有在途请求卡了 5 秒以上，都算「不空闲」。
- 队列等待上限——`background` 请求在队列里最多等 `LOW_PRIORITY_QUEUE_WAIT_MS = 8000`，之后抛 `GatewayBusyError`（`isGatewayYieldError()` 能识别），让调用方把剩下的活留给下一轮，而不是一路熬到请求超时刷一屏日志。

## 定时任务的健康度退避

服务端静默时的形态是：请求全部 `stage=pending` 挂十几秒、心跳开始漏拍，最后 5/5 心跳失败掉线。这种时候客户端再按 3~5s / 12~15s 的固定间隔发定时任务，只会把 pending 拉满、把心跳一起挤到超时。

所以 `runFarmTick()` / `runFriendTick()`（`core/src/core/worker.ts`）在入口检查 `isGatewayHealthyForBusiness()`：

- 判据只有两条——`heartbeatMisses > 0`，或有在途请求超过 `GATEWAY_STALL_PENDING_MS = 5000` 没回包。比后台闸门宽松得多，队列里有活、有业务请求在飞都不算不健康，定时任务本来就该和前台操作正常竞争槽位。
- 不健康就跳过本轮，并把 `nextFarmRunAt` / `nextFriendRunAt` 指数退避：首次 30 秒，之后翻倍封顶 60 秒（`nextBusinessBackoffMs()`）。farm 和 friend 各自记账，互不影响。
- 网关一恢复退避立即清零，回到正常间隔。日志只在进入退避（`网关无回包，农场定时任务退避 30s (...)`）和恢复（`网关已恢复，...回到正常间隔`）时各打一次，不刷屏。

退避期间连接上只剩心跳和 ACE 上报——它们有独立保留槽位，能安静地把连接救回来。

## 心跳判死的余量

`utils/keepalive-policy.ts` 里 `shouldTerminateForHeartbeat(misses, inboundSilenceMs)` 要同时满足 `misses >= MAX_HEARTBEAT_MISSES` 和 `inboundSilenceMs > HEARTBEAT_STALE_AFTER_MS = 30000` 才判死。心跳 25s 一发、请求超时 20s，所以第 N 次漏拍大约落在 45 + 25×(N−1) 秒：阈值 3 次是 ~95s，5 次是 ~145s。

放宽到 5 次的依据来自 2026-10-23 那次丹丹（gid 1129379473）的 `heartbeat_timeout`：判死前 60 秒下行还在涨（+97,533 B），随后 `read` 冻结、`write` 照常涨且被对端 ACK、`tx_queue=rx_queue=0`、`writableLength=0`，事件循环探针 1349 次采样 0 次停顿。也就是说本地既没卡也没堵，是这条会话在 server 侧不再被写。阈值从 3 放到 5 救不回这种会话，但它对「服务端慢 60~90 秒又缓过来」的抖动多给了两次心跳的余地，而 miss=1 就已经触发上面的退避，业务出站早被压住了，多等的 50s 攒不出额外超时请求。

同一次事故还确认：判死后拿原 Code 重启会立刻 `Unexpected server response: 400`（Code 是一次性的），所以 `source=heartbeat_timeout` 不重试。

## 自动化侧的请求削减

2026-10-23 那份日志里，8m55s 内 `AllLands` 发了 104 次（同期 `Heartbeat` 128 次），另有 20 条 `code=1000019 普通化肥容器不足`——这两笔都是没人要的流量：

- 奶茶自动化：一个动作原本拉三份活动快照（自动化侧选法用的 `shopState()`、`perform()` 写前校验、`perform()` 写后刷新），写后那份只被面板重渲染消费，自动化只读 `result/rewards`。现在 `operateMilkTeaActivity(action, input, { skipStateRefresh: true })` 跳过它，自动化每动作少一次 `GetGroup` + 一次背包/页签请求；手动面板路径不变。写前那份保留，它是 craft/hire/boost 选法防状态漂移的护栏。
- 普通化肥容器为空：地块侧筛不出「容器空」和「这块地还能施」的差别，所以补肥每轮都会重新检测到 N 块地、撞一次 `1000019` 再撞下一轮。`farm/api.ts` 记住这个结论 5 分钟（施成功任一块地立即解除，手动路径照常抛错），期间 `runFertilizerByConfig` 直接跳过普通施肥，纯普通化肥策略下连巡田检测的 `AllLands` 都不发。
- 巡田补肥把已经取到的地块快照传给 `runFertilizerByConfig(..., { lands })`，同一轮不再重复拉 `AllLands`（原来每轮两次）。

## 压力日志

`Gateway 请求压力: ...` 只在队列里有**非 `background`** 请求时才打（`utils/request-pressure.ts`）。队列里只剩后台补数据是正常运行，不算拥塞。

`queuedMethods` 里的前缀标记：`!H:` 心跳、`!A:` ACE、无前缀前台、`#` 自己农场、`&` 好友农场、`~` 后台补数据。

## 流量取证（只读，不参与调度）

班次管的是「同时在途几个」，服务端在意的是「每秒收到几个」——快速短请求下这两件事完全脱钩（in-flight 稳定在 2~3，单秒仍能发出 20+ 个）。为了能把两者分开量，`utils/traffic-meter.ts` 按秒记环形桶：

- 出站：`socket.send()` 成功后记一笔，带班次和方法名（`network.ts` 的 `sendMsg`）；
- 入站：`handleMessage()` 里按 `message_type` 分成「回包」和「主动推送」（3 是推送）。掉线时「只剩推送、回包为 0」和「彻底没有入站」是两种不同的死法，必须区分；
- 峰值和均值分别统计，突发不会被均值抹平。

产出三处，都是纯日志：

- `Gateway 流量: ...` 每分钟一条（无流量不打），带 `gid`，尾部再挂一份 TCP 快照（见下一节）——静默的那一分钟恰恰最需要知道内核收到了多少字节，以前只有掉线时才打印，这一行把每分钟都变成证据；
- `心跳未响应 (...)` 和 `请求超时: X (...)` 尾部追加 `近60s rps=... peak=.../s out=... in(回包=,推送=) 班次[...] 方法[...] 峰值在-Ns`，`心跳未响应` 还多挂一份 TCP 快照；
- 掉线原因串里带「掉线前 60s 流量」。
- 心跳重新收到回包且之前漏过拍时，一条 `心跳恢复: 连续 N/5 次未响应后重新收到回包，静默 Xs, 近60s ...`（`event=heartbeat_recovered`）。判死阈值放宽到 5 次之后，「漏两拍又自己活过来」这种情况会变多，这条用来数误判次数——它出现几次，就说明阈值帮连接续了几次命。

`峰值在-Ns` 是峰值那一秒距离当前几秒（`formatWindow` 末尾）。加它是因为 2026-10-22 那次要先回答「出站突发和下行字节冻结是不是发生在同一秒」，没有这个字段只能把两条日志的时间戳拿出来减。窗口内没有出站请求时不打印这一段。

2026-10-20 起 `connect()` 不再清零（按用户要求回到上游那份初始化逻辑）：计数器跨连接累计，重连空档也会被算进 60s 窗口。读速率时以 `gid` + 连接时刻为准，别把上一条连接的尾巴算进来。

## 停顿取证（只读，不参与调度）

2026-09-22 那次 `ws_close(1006)` 之前，每分钟一条的流量采样里出现了唯一一个 83.15s 的间隔（其余 453 个都是精确 60.00s）——有个 `setInterval` 回调晚了 23 秒才跑，紧接着连接就被对端拆了。`setInterval` 不会自己补回落后的节拍（libuv 按绝对时间重排），所以这 23s 是真实的停顿。

"定时器晚了 23 秒"至少有四种成因，光看日志时间戳分不开，`utils/stall-probe.ts` 每个 tick 同时取五组量来定性：

| 观测 | 来源 | 说明 |
| --- | --- | --- |
| 墙钟间隔 | `Date.now()` | 会被 NTP 校时和主机挂起影响 |
| 单调钟间隔 | `process.hrtime.bigint()` | 挂起/校时期间不走，两者一起涨就排除校时 |
| 活跃 / 空闲时长 | `performance.eventLoopUtilization()` | **单位是毫秒**；同步代码占住时活跃时间会跟着涨 |
| 事件循环延迟峰值 | `monitorEventLoopDelay()` | Windows 上对长阻塞不敏感（实测为 0），Linux 容器里才可信 |
| cgroup CPU 限流 | `/sys/fs/cgroup/cpu.stat` | 取增量，容器配额被打满时 `throttled_usec` 上涨 |

判定顺序（`classify()`）：钟差 > 2s → 时钟跳变或主机挂起；定时器没迟到但延迟峰值超阈值 → 同步阻塞；活跃时间占停顿 60% 以上 → 同步代码占住；有新增限流 → 容器 CPU 配额；活跃 < 20% 且延迟也没涨 → 进程未被调度（热迁移 / 快照 / 宿主抢占 / cgroup 冻结）。

产出三处，全是 `logWarn`，阈值只决定「要不要多打一行」：

- `Gateway 停顿: wall=... mono=... 活跃=... 空闲=... loop延迟峰值=... [限流+..ms/..次] 内存[...] 判定=...`，放在 `traffic_stats` 回调的第一句，掉线或本分钟无流量时照样采样；
- `连接被外侧拆除 (code=..., phase=...)，停顿: ...，近60s ...`——被动关闭时直接打一条，因为 `payload.reason` 只进下线推送文案，不会写进 `combined.log`；
- 掉线原因串（`heartbeat_timeout` / `ws_close`）里带 `停顿: 采样N次, 停顿M次, ...; 最长 wall=... 判定=...`。

`connect()` 不再和流量计数器一起 `reset()`（2026-10-20 按用户要求回到上游那份初始化逻辑）。因此「采样N次」不再等于单条连接的时长 —— 10-20 之前那条 `采样1200次` 恰好等于 20 小时是旧语义，以后读这行要把重连空档也算进去。

## TCP 层取证（只读，不参与调度、不参与断线判定）

流量计数只能说「交给了 WS 层几个请求」：`recordOutbound` 挂在 `socket.send()` 之后（`network.ts:420-422`），而 `ws.send()` 返回只代表数据进了 WS 层，不代表内核发出、更不代表对端 TCP 确认。同样，入站计数和 `lastInboundMono` 都排在 `GateMessage.decode()` 之后，解析失败的帧会被 `catch` 吞掉并打 `module=解码` 的 warn —— 那种情况下日志也是「无入站数据」。所以 `out=9 in=0` 同时兼容三种死法：服务端作废会话、这条 TCP 流被中间设备吃掉、帧进来了但我们没解出来。

`getTcpSnapshot()` 从 `ws._socket` 取四个数补上这个盲区。**注意这个数不是内核口径**：wss 下 `ws._socket` 是 `tls.TLSSocket`，`bytesRead/bytesWritten` 计的是**解密后 / 加密前**的明文字节。2026-10-22 实测：TLS 握手刚完成、HTTP 请求头还没发出去时 `read=0`（证书链那几 KB 密文已经收进来了），`write=61` 正好等于明文请求头的长度。Node 24 的对象图上拿不到裸 socket（`_sock` 已不存在，`s.handle` 是 TLSWrap 且计数与 TLSSocket 一致），所以只能停在明文层。

| 字段 | 含义 | 怎么读 |
| --- | --- | --- |
| `read` | 该 TLS 流**解密后**交上来的字节数 | 静默窗口里还在涨 = 数据进来了且解开了，是我们没解析（去看 `module=解码`）；不涨只能说明「没有明文交上来」，分不清对端没发还是密文被丢 |
| `write` | 交给 TLS 层加密的字节数 | 在涨而 `read` 不动 = 包确实要出去了，问题在链路单向或对端 |
| `缓冲` (`writableLength`) | WS 层还没交给 TLS 的部分 | 非 0 且持续涨 = 本侧发送被堵住（TCP 窗口/背压），不是服务端沉默 |
| `peer` | 对端 `地址:端口` | 用来确认这些字节属于哪条流 |
| `队列` (`txQueue`/`rxQueue`) | 内核为该流记账的**未确认发送 / 已收未读**字节 | 见下，这是唯一能突破明文口径的两个数 |

`read` 冻结这一点只能排除「帧进来被 decode 吞掉」和「pong 到达」，排不掉「服务端停写」和「下行密文被丢/记录不完整而静默等待」——这两者要用内核的队列计数来分。`utils/tcp-queue.ts` 因此去读 `/proc/net/tcp` + `/proc/net/tcp6`，按 `(localPort, remotePort, remoteAddress)` 四元组匹配那一行，取 `tx_queue:rx_queue` 字段（十六进制），并入 `getTcpSnapshot()` 的返回值：

- `txQueue` 在涨而 `rxQueue` 恒为 0 → 我们发了、内核没被确认，服务端不 ACK（链路或对方栈的问题）；
- `rxQueue` 非 0 → 密文已经进到内核、被我们读走了（`read` 不动就回到「没解密出明文」，即解码或 TLS 层的问题）；
- 两者都是 0 且 `read` 冻结 → 内核也没收到，坐实对端停写。

非 Linux（Windows 开发机）或表里找不到这条连接时 `readSocketQueues()` 返回 `null`，字段直接不出现（`formatTcpSnapshot` 判断 `txQueue === undefined` 就不打这段），不影响任何逻辑。地址是**小端**十六进制（`0625C07A` → `122.192.37.6`），`tcp6` 那半截地址比不了，只按端口命中。

产出三处：每分钟 `Gateway 流量` 尾部、`心跳未响应 (...)` 尾部、掉线原因串尾部（都是 `tcp[read=..,write=..,缓冲=..,peer=..,队列=tx=..,rx=..]`），另外 `connection_summary` 的 `diagnostics.tcp` 里带同一份结构化数据。取不到 `TLSSocket`（测试桩等）时降级为 `tcp=不可用` / `null`。

顺带在 `open` 事件里打开内核探测 `_socket.setKeepAlive(true, 15000)`：15s 空闲后开始发探测包，对端 TCP 栈还活着就会被 ACK。注意探测失败要等 `tcp_keepalive_intvl × probes`（Linux 默认约 11 分钟）才把 socket 报错，比约 145s 的心跳判死慢得多，所以它只用于事后定性这条流当时的死活，不会提前触发重连。

## 掉线后先用原 Code 重启一次

进程内的网络层始终不复用旧 Code（`network.ts` 的 `connect()` 拒绝在还有活连接时再进来）。要做重试是因为掉线后原来的行为是**直接停等人工**：09-04→09-21 的日志里 31 次进程级掉线（17 次 `heartbeat_timeout` + 14 次握手 `400`）全都停在「等待 Helper 刷新 Code 或重新扫码」，要人盯着去刷新，这才是"经常掉线"体感里最长的部分。

所以重试放在主进程：`runtime/worker-manager.ts` 收到 `account_disconnected` 后，先拿断开那一刻的 Code（`worker.accountRef`，不是账本里可能被改过的最新对象）把账号进程重启一次，隔 `3s` 拉起，走完整的登录 + 启动序列。这一次**不发下线提醒**——提醒的语义是「需要人工」，试不动了才发。

不会变成登录风暴的四道闸：

- 只在 `phase=online` 时重试：握手阶段就被拒（`400` / `login_timeout`）说明 Code 本身无效，重发只会再吃一个 400；
- `source=heartbeat_timeout` **不重试**（2026-10-22 起）：心跳判死意味着服务端已经把这条会话作废，拿原 Code 重启等于用废掉的凭证再要一次登录。当天三次同类事故（含「风筝有风」那次）全是重启 → `Unexpected server response: 400` → 还是要人工，只是多花了 3 秒和一轮启动序列，所以这类掉线直接按老路径交人工；
- 被其他终端踢下线走 `account_kicked`，不参与重试（等于和真人抢登录）；
- 每个账号按 Code 记账（`codeRetryStates`）：同一个 Code 在 `10min` 窗口内只试一次，换过 Code 或过了窗口才重新获得一次机会。

所以现在还会走原 Code 重启的只剩「连接被外侧拆掉且不是心跳判死」——主要是 `ws_close(1006)` 这一类链路级被动断开，Code 在服务端那边大概率还有效。

面板上手动停止 / 删除账号会清掉待执行的重试任务（`stopWorker()` 里 `managerScheduler.clear('code_retry_...')`），不会 3 秒后把用户刚停掉的账号拉起来。

## 登录后的启动序列

`core/src/core/worker.ts` 的 `runStartupSequence()`。以前是四个错峰定时器（农场 2s / 好友 8s / 每日领取 45s / 神秘商店 60s），每日礼包要等一分钟才领，而那时农场和好友循环已经在跑，几件事叠在一起反而把连接打满。

现在登录动作一结束先串行跑完 `await runDailyRoutines(true)`（邮件 / 每日分享 / 月卡 / 免费礼包 / VIP）→ `await checkAndClaimTasks()`，然后才挂上农场/好友主循环和后续周期性定时器。串行意味着登录启动期同一时刻只有一个业务请求在飞，既领得及时，也不会和心跳抢连接。神秘商人不再参与登录首查；只有“自动购买”或“到货提醒”开启时，才每 2 小时定时检查一次。

## 定时任务的相位错峰

班次和互斥管的是「同一时刻最多几个在飞」，管不了「很多个任务恰好同一秒到期」。2026-10-22 那次掉线前，`Gateway 流量` 里 `peak=10/s` 的那一秒和入站冻结发生在同一秒，用 `onlineAgeMs` 反推：连接建立于 02:07:49.1，突发落在 06:07:49.7 —— **T0 + 4 小时整**。原因很直白：奶茶（30min）、节令日历（30min）、神秘商人（2h）三个定时器都在「登录就绪」那一刻注册，`setInterval` 没有相位概念，周期又互为整数倍，所以每 30 分钟其中两个必然同秒到期、每 2 小时三个一起。每 30 分钟制造一波十来个请求的突发，就是自己给自己制造丢包窗口。

`services/scheduler.ts` 的 `setIntervalTask` 因此支持 `options.phaseMs`：把整条节拍往后挪，**周期本身不变**，偏移期内不会有任何一次执行（`nextRunAt` 也一起带上，面板读数不撒谎），偏移期内 `clear()` 直接连带取消，节拍不会在之后冒出来。不传就是老行为。

`core/src/core/worker.ts` 取的偏移是 `11 / 19 / 37` 分钟（对 30min 分别是 11 / 19 / 7），三个分钟数互不重合，所以之后任何一秒只会有一个任务到期。节令的首次执行也从 90s 改成 150s，避免和奶茶的首跑同秒——两个首跑撞在一起会一起抢锁，把登录后第一次读取挤成一波突发。

## 自动任务全局互斥

`core/src/services/automation-lock.ts` 提供进程内的自动任务互斥队列：

- 所有后台自动任务入口都通过 `runExclusiveAutomationTask()` 串行执行；
- 串行之外还有缝：两个任务之间至少留 `MIN_TASK_GAP_MS = 1.5s`（`lastTaskEndedAt` 记账，队首那个不够就 sleep 到够）。纯 FIFO 只保证不并发，同秒到期的任务会首尾相连接着发，出站速率照样是突发的——真正要压的是「每秒几个」，不是「同时几个」；第一个任务不等，嵌套的可重入路径也不等；
- 同一任务链内部的嵌套调用可重入，不会自锁；
- 心跳、ACE/AntiData、面板前台操作不进这个互斥队列，保留原有优先级和响应体验；
- 队列只约束“自动任务”，不约束用户手动操作；如果某个自动任务长时间不返回，后续自动任务会排队等待。

当前已接入互斥的自动入口包括：登录启动序列、每日例行、农场巡检、好友巡查、推送触发巡田、好友申请处理、宠物同步、任务领取、神秘商人、化肥购买与立即施肥、收获后出售、宠物礼包拾取。

## 相关文件

- `core/src/utils/request-priority.ts` — 班次、容量、调度选择（纯函数）
- `core/src/utils/request-context.ts` — 环境班次（`AsyncLocalStorage`）
- `core/src/utils/network.ts` — 排队、发送、`getGatewayLoad()`、`waitForGatewayIdle()`
- `core/src/utils/low-priority-gate.ts` — 后台任务的空闲判定、定时任务的健康度退避、让路错误分类
- `core/src/utils/request-pressure.ts` — 压力日志节流
- `core/src/utils/traffic-meter.ts` — 按秒的出入站流量取证（含回包/推送区分、峰值秒）
- `core/src/utils/tcp-queue.ts` — 从 `/proc/net/tcp{,6}` 按四元组读内核 tx/rx 队列（非 Linux 降级 null）
- `core/src/utils/stall-probe.ts` — 定时器停顿归因（墙钟/单调钟/ELU/循环延迟/cgroup）
- `core/src/services/scheduler.ts` — 命名空间班次注入 + `setIntervalTask` 的 `phaseMs` 错峰
- `core/src/services/automation-lock.ts` — 自动任务全局互斥（含任务间 1.5s 缝）
- `core/tests/request-priority.test.js` — 分层与容量的契约测试
- `core/tests/low-priority-gate.test.js` — 让路闸门与定时任务退避的契约测试
- `core/tests/traffic-meter.test.js` — 流量计账与窗口格式
- `core/tests/tcp-queue.test.js` — 小端地址还原、四元组命中、tcp6 只比端口、降级 null
- `core/tests/scheduler-phase.test.js` — 相位期内不执行、周期不变、相位期内 clear 不复活
- `core/tests/stall-probe.test.js` — 停顿判定
