# 新活动自研手册：从抓包到上线，不依赖上游

> 适用场景：游戏上了新活动，上游仓库还没跟进（或者不打算再跟），需要在当天把活动做成可自动跑的功能。  
> 样板案例：2026-11 的「以薯换福」（活动组 `2026111707` / 主活动 `2026111708`）。这次全程没有 merge 上游任何提交，协议是从自己的抓包里解出来的，种子素材是从自己机器上微信小程序的游戏包里抠出来的。

## 0. 一句话方法论

活动 = **素材** + **协议** + **状态** + **动作** + **前端**。

- 素材从小程序包/缓存里抠（`tools/download-game-config.js`、`tools/download-game-images.js`）；
- 协议从自己的抓包里解（`tools/decode-latest-protocols.js`）；
- 状态靠**差分抓包**收敛，不靠猜；
- 动作靠**实机回包对账**（数量、金额、余额三项必须闭口）；
- 前端照已有活动的壳子填，别另起设计。

每一步都留证据：版本号、SHA-256、抓包时间、实机数值。下次出问题能一眼回溯，不用重新反推。

---

## 1. 全景链路

| 阶段   | 产物                                   | 落点                                                                                | 工具 / 入口                                                         |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| ① 素材 | `ItemInfo.json`、`Plant.json`、种子/植物图片 | `core/src/gameConfig/`、`web/public/activity-assets/<name>/`                       | `tools/download-game-config.js`、`tools/download-game-images.js` |
| ② 协议 | 新增/扩充 `.proto`                       | `core/src/proto/*.proto`                                                          | `tools/decode-latest-protocols.js`                              |
| ③ 服务 | `<name>.ts` 读写状态与动作                  | `core/src/services/activity-center/`                                              | 手写，参照 `yishuhuanfu.ts`                                          |
| ④ 注册 | 活动能被目录、玩法、Worker 认出来                 | 5 个注册点（见 §4.3）                                                                    | —                                                               |
| ⑤ 自动 | `<name>-auto.ts` 定时任务                | `core/src/services/`                                                              | 参照 `yishuhuanfu-auto.ts`                                        |
| ⑥ 配置 | 开关与数值项                               | `models/store/shared-state.ts` + `web/src/views/Settings.vue`                     | —                                                               |
| ⑦ 前端 | 页面 + Tab + store                     | `web/src/views/activity-center/`、`web/src/components/activity/`、`web/src/stores/` | —                                                               |
| ⑧ 测试 | 协议/服务/自动三件套                          | `core/tests/<name>-*.test.js`                                                     | `node --test`                                                   |

后一阶段依赖前一阶段。协议没定下来之前不要写服务，状态语义没定下来之前不要开自动任务——否则改一遍要动三个层。

---

## 2. 第一步：把游戏原始素材抠出来

### 2.1 定位小程序包

微信小程序的游戏包目录名就是 App ID，本项目用的微信 App ID 是 `wx5306c5978fdb76e4`（写在 `core/src/utils/tsdk-runtime.ts` 的 `MINI_PROGRAM_APP_IDS` 里）。在本机微信的 `Applet` 缓存目录下按这个 ID 找最新版本目录，里面能拿到：

- 反编译后的资源树（本项目约定的路径是 `D:\wxsource\wx5306c5978fdb76e4-code`，也是两个下载脚本的 `--source` 默认值）；
- `tsdk.wasm` / `tsdk-wx.wasm`（TSDK 升级时从这里取，见 §6）。

### 2.2 下载配置表

```bash
node tools/download-game-config.js --source D:/wxsource/wx5306c5978fdb76e4-code --output tools/json
```

脚本做的事（不是简单 HTTP 下载，值得知道原理，资源结构变了要跟着改）：

1. 读 Cocos bundle 的 manifest（bundle 名 `mainscene`），按 `config/ItemInfo` 这类逻辑路径找到资源；
2. manifest 里的 uuid 是压缩过的，用 `decodeCocosUuid` 还原后拼出 CDN 地址；
3. 拿到的是 **Base64 文本**，严格校验规范性后解码；
4. 用固定密钥 `NQF_SHANGXIANDAMAI_#2026_SECURE` 循环 XOR 解密；
5. UTF-8 解码成 JSON，落盘。

当前抓的 8 张表：`ItemInfo`、`Goods`、`Plant`、`RoleLevel`、`Land`、`MutantEffect`、`BuffCfg`、`Illustrated`。新活动如果要新表，在脚本的 `SELECTED_RESOURCES` 里加一行（`name` / `path` / `assetName`）即可。

> XOR 密钥是硬编码在脚本里的。游戏换了密钥，脚本会解出乱码 JSON 直接报错——这是好事，比静默产生半截数据强。

### 2.3 下载图片

```bash
node tools/download-game-images.js \
  --input tools/json \
  --output core/src/gameConfig/seed_images_named/seed_images \
  --source D:/wxsource/wx5306c5978fdb76e4-code \
  --concurrency 8 --retries 3
```

图片不是按 ID 猜路径，而是**精确映射**：`ItemInfo.json` 里每条记录的 `icon_res`（形如 `xxx/spriteFrame`）+ 资源表里的 `asset_name`，去 manifest 的 `paths` 索引里查唯一候选，要求类型是 `cc.SpriteFrame`，再按同一个 XOR 流程解码成 PNG。查不到、查到多个、类型不对都会显式报错（`PATH_NOT_FOUND` / `PATH_AMBIGUOUS` / `TYPE_MISMATCH`），不会下错图。

本次实例：红薯种子 `item_id = 20307`，落地 `core/src/gameConfig/seed_images_named/seed_images/20307.png`，服务端常量 `YSHF_SEED_ITEM_ID = '20307'` 直接引用这个 ID 读余额。

### 2.4 活动专属素材

活动界面用的图（图标、人物、菜品等）放 `web/public/activity-assets/<活动名>/`，以薯换福只放了一张 `icon.png`。命名用语义名（`interact-1.png`、`recipe-3.png`），不要用 CDN 的 uuid，否则下个版本对不上。

---

## 3. 第二步：抓包拿协议

### 3.1 前置

```bash
pnpm install && pnpm build:core
```

解码脚本走 `core` 的 `protobufjs` 与 `crypto-wasm.ts`（部分回包要 WASM 解密），所以必须先装依赖、构建 core，否则脚本直接起不来。

### 3.2 抓包要求

- 一次抓包只做一个动作，动作之间留 3–5 秒，方便在时间线上切分；
- 抓**完整会话**（登录 + 心跳 + 目标操作），否则分不清哪些是活动协议、哪些是通用状态；
- 保存目录里通常会有 `*.jsonl` 形式的帧记录，解码脚本直接吃目录。

### 3.3 解码

```bash
# 全量解码，输出每个方法的字段形状
pnpm -C core exec tsx ../tools/decode-latest-protocols.js <抓包目录> --all --shape

# 只看活动相关
pnpm -C core exec tsx ../tools/decode-latest-protocols.js <抓包目录> gamepb.activitypb.ActivityService.Operate --shape

# 只要摘要（方法 → 次数 → 长度）
pnpm -C core exec tsx ../tools/decode-latest-protocols.js <抓包目录> --summary
```

默认只解 `selected` 白名单里的方法（登录、心跳、好友、活动、背包、邮件等）；要解全部就加 `--all`。脚本会**保留未知字段**，这是关键——新活动的字段一开始全在 proto 之外。

### 3.4 关键认知：活动命令走 `Operate` 的 cmd 模型

以薯换福没有独立的 service，全部走：

```
gamepb.activitypb.ActivityService.Operate
  ├─ 请求 field 2：cmd（命令号，91 / 92 / 93 / ...）
  ├─ 请求参数消息：挂在 100 + cmd 号槽位
  └─ 回包：挂在同一个 100 + cmd 号槽位
```

这和老的 `operate_type` 协议不一样。抓到 `Operate` 之后先看请求里的 `cmd`/`operate_type` 数值，再看回包里哪个 field 号变成了 `100 + cmd`（91→191、92→192、93→193、98→198），一一对上就能定位参数结构。

拿到的 cmd 表（详见 [yishuhuanfu-20261125.md](yishuhuanfu-20261125.md)）：

| cmd | 用途    | 请求               | 回包槽位                                                    |
| --- | ----- | ---------------- | ------------------------------------------------------- |
| 91  | 领当日种子 | 空                | `grant{item_id,count}`                                  |
| 92  | 查铺子行情 | `shop_gid`       | `quote{base_price,bonus_price,quota,shop}` + `can_sell` |
| 93  | 卖蜜薯   | `shop_gid,count` | `sell{count,price,total,quota,balance}`                 |
| 95  | 收购记录  | 空                | `records[]`                                             |
| 96  | 兑换下单  | `index,count`    | `exchange{price,balance,grant}`                         |
| 97  | 兑换目录  | 空                | `catalog.goods[]`                                       |
| 98  | 分享铺子  | 空                | `share{price,grant,shop.share_key}`                     |
| 99  | 领收购提成 | 空                | `commission{amount,balance}`                            |

### 3.5 从「一堆未知槽位」到「可用协议」的四步法

这是本次最值钱的经验，按顺序做，别跳步。

**第一步：差分定位状态槽。** 同一账号在动作前后各抓一次 `ActivityService.GetGroup`，diff 回包：哪些 field 变了、变成多少。以薯换福的主状态全在 `GetGroup` 回包的 `field 130` 里，`130` 内部再分子槽（1 claims / 2 share / 3 福气币 / 5 基础价 / 6 加成 / 7 接收量 / 11 待领提成 / 13 提成标志）。

**第二步：用动作校准语义。** 领种子（cmd 91）后 `130.1.1` 从缺失变 1；分享（cmd 98）后 `130.1.2` 变 1。这样 `claims` 的两个 bool 就有了实测依据，不用靠本地日期记账。

**第三步：交叉验证数字。** 成交价必须能和界面上的数字对上：`111 + 33 = 144`（自己铺子，与 cmd 93 的 `price` 一致）、`99 + 66 = 165`（好友铺子，与界面「今日蜜薯收购价」一致）。对不上就是字段读错了，回去重做第一步。

**第四步：保守命名。** 语义没取证的字段一律叫 `field_N`，并在 proto 注释里写清楚「实机多少、什么时候出现、疑似什么、未断言」。本次 proto 里就有大量这样的注释，例如：

```proto
// 状态槽 130 的 4 号子槽：动作标记。实机只保留最近一次动作（卖出 / 分享 /
// 领种子互相覆盖），不能用来判断"今天是否已领种子"。
message YshfActionSlot { int64 field_1 = 1; int64 field_2 = 2; int64 field_3 = 3; }
```

宁可有 `field_7`，也不要写一个猜错的 `is_done`——猜错的字段会被上层逻辑当真，比缺失危险得多。

### 3.6 两个必须记住的坑

**坑一：bool 的三态。** protobufjs 对 `bool` 取默认 `false`，读出来分不清「服务端明确发了 0」和「压根没发这个字段」。`can_sell` 就是三态（true 可卖 / false 明确拒收 / 没带字段按可卖处理），所以：

```ts
const hasCanSell = Object.prototype.hasOwnProperty.call(reply, 'can_sell');
if (hasCanSell && reply.can_sell === false) throw businessError('YSHF_SHOP_CLOSED', ...);
```

**坑二：写操作要闭口。** 卖薯回包回来先对账：请求 `count` 与回包 `count`、`price × count` 与 `total`、余额变化。任意一项对不上就中止本轮，**不重试猜结果**。自动任务最怕「其实成功了但以为失败，再卖一次」。

### 3.7 落 proto 的规范

- 新活动单独开注释块，写清活动组 ID、主活动 ID、`type`、有效期；
- 每条 cmd 在注释里写请求/回包槽位号；
- 每个语义字段注释里带实机证据（时间点、数值、出现条件）；
- 改过的错误理解要留在注释里（例如「旧文档把 5/6 写反过，勿再混用」），防止下一轮再踩。

### 3.8 活动期中协议会变：设计时就要留出「重查」的路

以薯换福在活动第 4 天（2026-11-28）被服务端加了校验：卖进好友铺子必须带对方当天的分享标识，只带 gid 的老路直接失效；同一版还开始下发兑换档位的已兑次数。两次都没有公告，只有抓包能看出来。

这类热更改不掉「协议层」，但会改掉**上层设计**，所以要提前留好三个口子：

1. **写请求带一份「引用对象」而不是只带 ID。** 现在 cmd 92/93 的 params 里除了 `shop_gid`，还带 `shop{activity_id,gid,share_key}`。字段可缺省，缺省时退回旧行为；服务端一加校验，只要填上就能继续用，不用改协议结构。
2. **候选池永远按「可成交性」筛，不按「能查到价」筛。** 能查到价不等于卖得进去。候选池的准入条件写成「拿得到对方当天的分享标识」，缺标识的只展示不给按钮，自动任务直接跳过（否则一轮 3 次的写预算全浪费在被拒的请求上）。
3. **回包里的每个计数都要能回写界面。** cmd 96 的 `count` / `exchanged` 不是日志字段，是用来更新「限购 x/y」的数据源；目录又不在活动快照里，所以兑换成功后必须重拉 cmd 97，否则界面一直显示兑换前的次数。

顺带一条经验：**同一个回包里出现两个「像 key 的东西」时，先确认哪个是服务端真正校验的**。cmd 98 的 2 号位是 32 位邀请码（与 `GetShareKey` 同值），5 号位才是卡片里的 UUID 标识；早期 proto 把 2 号位当 `share_key`，读出来永远对不上，还查不出原因。

最狠的一课在同一天下午补上：**读接口的权限也可能一起收紧，而且它不报错——直接退回你自己的数据。** 不带标识去查别人的 gid，cmd 92 回的是自己铺子的行情，字段结构一模一样，拿 `gid` 一贴就变成「好友的价」。所以凡是「按 ID 查别人资源」的读接口，都要有一条断言兜住：请求带了别人的 ID、服务端却没带上对应凭据时，宁可报错空着，也不要把回包当真。落地做法是在 `fetchShopQuote` 里先判 `!sameAccount && !shopRef` 直接抛错，一次网关请求都不发。

还有一条纯前端的坑，加新写接口时必踩：**写操作的回包如果不带 snapshot，前端会重拉活动目录来刷新，而目录里没有「已选中活动的详情」**（qixi / yishuHuanfu / charity 都是单独一个 `GET /api/activity-center/<activity>` 拉的）。整份替换的结果就是页面突然变成空壳——目标单价 0、可用蜜薯 `--`、兑换商店「未加载」。要么让写接口像别的动作一样带回 snapshot，要么在重拉目录时把已有详情保住（本仓库的做法：`mutate` 里记录 `DETAIL_SNAPSHOT_KEYS`，load 完把丢掉的补回去）。

---

## 4. 第三步：后端接入（core）

### 4.1 目录与命名

```
core/src/services/activity-center/<name>.ts        # 活动服务（读状态 + 写动作）
core/src/services/<name>-auto.ts                   # 定时任务
core/tests/<name>-proto.test.js
core/tests/<name>-service.test.js
core/tests/<name>-auto.test.js
```

### 4.2 服务骨架要点

- 用 `sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', body)` 发包，`Operate` 请求统一构造：`{ operate_type / cmd, [100+cmd]: params }`；
- 读状态走 `GetGroup` 一次拿全，别为每个字段单独发一次请求；
- 写接口暴露 `withSnapshot` 选项，自动任务调用时传 `false`——写操作后重建整份活动中心快照要读 7 个活动，代价远高于一次写；
- 余额统一从 `refreshBalances()` 走，`currentBalances()` 只同步读内存，别在活动服务里另开一条打网关的路。

### 4.3 五个注册点（漏一个就「活动能开但点不动」）

| # | 文件                                                                         | 要加什么                                                                                                                                 |
| - | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | `core/src/services/activity-center.ts`                                     | `require('./activity-center/<name>')`、`createXxxService({...})`、把方法挂到导出对象、加入 `buildActivityDirectory` 的形参与 `available` / `errors` 汇总 |
| 2 | `core/src/services/activity-gameplay-registry.ts`                          | `ActivityDetailTarget` 联合类型加一项；`bindings` 里加 `{ gameplayKey, detailTarget, priority, activityIds }`                                  |
| 3 | `core/src/core/worker.ts`                                                  | `require` 自动任务，并在两个启动点（首启 + 重载配置）都调一次 `startXxxTimer(workerScheduler, () => loginReady)`                                             |
| 4 | `core/src/controllers/admin/activity-center/index.ts` + `<name>-routes.ts` | 后台接口路由挂载（页面按钮走的就是这些）                                                                                                                 |
| 5 | `core/src/models/store/shared-state.ts`                                    | 自动化开关与数值项的默认值 + `normalizeAutomationValue` 归一化分支                                                                                     |

`activity-windows.ts` 不用改：活动时间窗是从服务端 `ActivityService.List` 动态拉的，新活动上线后会自动出现在窗口表里。

### 4.4 自动任务范式

以薯换福自动任务的可复用取舍（照抄比自己设计快）：

- 挂 `workerScheduler`，10 分钟一轮，**相位错开**（4 分钟，避开节令 19 / 神秘商人 37 / 牧歌 11）；
- 首跑延迟 260s，等登录与首轮同步稳定；
- 整轮串进 `automation-lock` 的同一把全局锁，避免和其它任务并发打网关；
- 一轮只读一次状态，然后依次做：领种子 → 分享 → 卖薯 → 领提成，**每步都先查服务端标记再动手**；
- 跳过原因按服务端日期去重，一天只记一行，不刷日志；
- 写操作回包未确认即中止本轮。

### 4.5 配置项的归一化陷阱

数值项必须在 `normalizeAutomationValue` 里显式夹取，否则会被通用兜底的 `!!value` 折成 `true`（`fertilizer_smart_seconds` 踩过同一个坑，`yishu_sell_after_time` 也踩过）：

```ts
if (key === 'yishu_scan_friend_limit') {
    return Math.max(1, Math.min(200, Number.parseInt(String(value), 10) || 50));
}
if (key === 'yishu_sell_after_time') {
    return normalizeSellAfterTime(value);  // "HH:MM" 字符串，不特判会被折成 true
}
```

### 4.6 测试怎么写

- `*-proto.test.js`：钉死固定抓包数值（144 = 111 + 33、165 = 99 + 66、记录 `total=4320 / commission=86`），协议字段一改就红；
- `*-service.test.js`：桩掉 `sendMsgAsync`，验证「已领就不发」「额度不足换下一家」「回包金额不符就停手」；
- `*-auto.test.js`：给 harness 桩加上真实后端的行为（排序、按 limit 截断、缓存 TTL），否则测不出「配置太小漏掉最高价」这类问题。本次就是靠 `scanLimitTruncates` 桩复刻后端排序，才发现只扫前 20 家会永远卖次高价。

---

## 5. 第四步：前端接入（web）

### 5.1 三个文件 + 两处注册

```
web/src/views/activity-center/<Name>ActivityPage.vue   # 页面壳，接 props/emit，调 store
web/src/components/activity/<Name>Tab.vue              # 业务 Tab，放具体交互
web/src/components/activity/gameplays/<name>/index.ts  # 玩法模块声明
```

注册：`web/src/components/activity/gameplays/index.ts` 里加进 `gameplayModules`，并在 `inferGameplayKey` 里补 `detailTarget` 与活动 ID / 名称的识别分支。名称识别是兜底，`detailTarget` 是主路。

### 5.2 store 归一化

`web/src/stores/activity-center.ts` 里为活动加 state 字段、`load` 分支、`loadedAccountId` 守卫。切号时**只清真正与账号绑定的数据**：

- 与账号无关的聚合数据（例如「面板所有账号好友」的比价池）不要清，清了反而要重扫；
- 与账号强绑定的数据（收购记录）由 loader 内部的 `accountId` 守卫自行清理并重拉。

### 5.3 三个交互坑（都踩过）

| 症状                  | 原因                                                         | 修法                                              |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| 选中好友铺子后按钮「自己变回卖给自己」 | `watch` 依赖里放了会随快照刷新的 `shop.gid`                            | watch 只依赖 `accountId` + `activityId`            |
| 面板好友比价池永远是空         | `require('../models/store')` 在二级目录下指错路径，异常被 `try/catch` 吞掉 | 用 `require('../../models/store')`，并加一条「池为空时打日志」 |
| 前端类型检查报缺字段          | `Settings.vue` 的缺省对象没同步新字段                                 | 三处默认对象一起补                                       |

第三条尤其容易漏：`syncLocalAutomationSettings()` 有多个缺省分支，新增配置项要全部补齐，否则 `vue-tsc` 直接红。

---

## 6. TSDK 更新流程

TSDK 是登录与心跳的底座，活动更新一般**不需要**动它；只有游戏大版本换了 TSDK 才需要。判断依据和完整约定见 [tsdk-runtime.md](tsdk-runtime.md)，这里是执行版。

### 6.1 什么时候必须更新

- 登录失败，日志里出现 TSDK 断言 / 初始化失败 / 文件校验失败；
- 登录成功但心跳被踢、`SendMsg` 长时间无回包；
- 网关返回 token 校验类错误（token 格式变了）；
- 游戏大版本更新公告里带了新的资源版本号（例如 `1.17.x.y_2026MMDD`）。

### 6.2 提取与落位

1. 从新包（或小程序缓存）取 `tsdk.wasm`（QQ）与 `tsdk-wx.wasm`（微信），**两个平台分开**，不能混用；
2. 备份旧文件（`core/src/utils/tsdk*.wasm`）；
3. 计算哈希：`sha256sum core/src/utils/tsdk.wasm core/src/utils/tsdk-wx.wasm`；
4. 更新 `core/src/utils/tsdk-runtime.ts` 的 `TSDK_BUILDS`（每个平台三项：`file` / `version` / `sha256`）。


当前基线（2026-11-25 抓包对齐）：

| 平台 | 文件 | 版本 | 大小 | SHA-256 |
| --- | --- | --- | --- | --- |
| QQ | `tsdk.wasm` | `v3.9.0.1794737607` | 161,118 B | `ab6eb0f0ee86ce8984b0c37a481ff51e7722961ff0b50a9f91e2fa9ff351ce74` |
| 微信 | `tsdk-wx.wasm` | `v3.9.0.1794837963` | 160,956 B | `d14a4f5d59c8a27128019dbad25fe3cd3d5243dfc389eb9bcbb345efb1cebc9a` |

### 6.3 每次必比清单

| 项目 | 怎么比 | 通过标准 |
| --- | --- | --- |
| SHA-256 | `sha256sum` 与 `TSDK_BUILDS` 对照 | 完全一致，否则启动即抛「TSDK 文件校验失败」 |
| 宿主导入 ABI | 看 `createImports()` 的模块 `a` 下 `a.a`–`a.v` 共 **22** 个函数是否还都能被引用 | 实例化不抛 `LinkError` |
| 具名导出 | `x` `y` `A` `B` `E` `G` `H` `M` `N` `O` `P` `aa` `ba` `ca` `fa` 共 **15** 个 | 缺一个就抛「TSDK 缺少导出」 |
| memory 导出 | `exports.w` 是 `WebAssembly.Memory` | 否则抛「memory 导出不兼容」 |
| mergewasm 导出 | `__mergewasm_shared____wasm_decrypt_strings`、`decrypt_all_data` | 缺任一个抛「缺少 mergewasm 数据解密导出」 |
| 数据段地址 | `MERGED_DATA_METADATA = [67371008, 404]`、`MERGED_DATA_KEY = 1871261153`、`RUNTIME_TABLE`（59 字节） | 解密不崩、字符串表可读；地址变了要按新包重定位 |
| QQ 宿主特征指针 | `QQ_HOST_FEATURE_STATE`（`currentPtr 17288` / `referencePtr 17352` / `length 64` / `nodeMismatchIndex 1`） | 环境探测通过，否则 QQ 侧初始化异常 |
| 初始化凭据 | `H()` 传入的 `80 + openId 长度` 字节化信息逐字节对比 | 长度或结构变了必须改宿主代码 |
| 加解密往返 | `ba()` 加密 → `ca()` 解密，比对原文 | 往返一致 |
| 登录 / 心跳请求体 | 与同版本抓包逐字段比对 | 字段号、必填项一致 |
| 网关 Token | 随机 64–127 字符 + `=`，总长 65–128 | 长度落在区间内 |

### 6.4 失败症状对照

| 症状 | 大概率原因 |
| --- | --- |
| 启动即「TSDK 文件校验失败: <hash>」 | 换了 wasm 但没更新 `sha256` |
| `LinkError: import object field 'x' is not a Function` | 新包改了导入项（字母序列变了），要补/改 `createImports()` |
| 「TSDK 缺少导出: xx」 | 新包改了导出名，要同步改名（逻辑位置通常不变） |
| mergewasm 解密崩 / 字符串乱码 | 数据段地址或密钥变了，重定位 `MERGED_DATA_METADATA` / `MERGED_DATA_KEY` |
| 登录成功但 5 秒内掉线 | 心跳调度或 `M()` 语义变了（当前节奏：每 5s `N()`、再 5s `P()`、每 25s `M()`、每 30s 速度检测、每 150s 状态上报） |
| 只有微信侧失败 | 混用了 QQ 的 `tsdk.wasm`，平台文件必须分开 |

### 6.5 更新后的验证顺序

1. 单元级：加解密往返、`H()` 字节数、Token 长度区间；
2. 集成级：单账号完整登录 + 心跳 10 分钟不掉；
3. 多账号：`core/data/tsdk/<accountId>/` 每账号独立目录，确认没有串号；
4. 端到端：跑一轮日常任务，看 `ACE` 日志出现「新版 TSDK 初始化成功: <version>」；
5. 发布：wasm 随构建产物走，`core/dist`、`web/dist` 被 `.gitignore` 忽略但仓库历史跟踪，提交要 `git add -f`。

### 6.6 注意

- 版本号格式是 `v3.9.0.<build>`，`build` 号通常等于抓包时的资源版本时间戳，别手改；
- `MINI_PROGRAM_APP_IDS`（QQ `1112386029` / 微信 `wx5306c5978fdb76e4`）、`TSDK_GAME_ID = 3167`、`TSDK_APP_KEY = '0'` 是固定参数，除非官方明确改了，不要动；
- 换 wasm 不要在同一个提交里混活动业务改动，出问题无法二分。

---

## 7. 每次游戏版本更新的例行体检

复制这段当 checklist 用：

```
[ ] 1. 抓一次完整会话，--summary 看方法集合有没有新增 service
[ ] 2. --all --shape 全量解码，diff 出字段形状变化（新增/改号/类型变）
[ ] 3. ActivityService.List 里新活动的 group/activity id 记录进 registry
[ ] 4. 下载配置表，diff ItemInfo/Plant 的新条目（新种子、新道具）
[ ] 5. 下载新图，确认 icon_res 编码仍然走同一套映射
[ ] 6. 老活动回归：状态槽语义是否被改（重点看 claims/can_* 这类布尔三态）
[ ] 7. TSDK 版本号/哈希是否变化（变了走 §6）
[ ] 8. pnpm build:core + node --test core/tests，与既有失败基线比对
[ ] 9. typecheck:web + build:web
[ ] 10. 前端素材路径、活动名识别分支是否还需要补
[ ] 11. 活动期中也要定期抓包：服务端会在不通知的情况下加校验（以薯换福第 4 天加了分享标识），
       重点是「写请求多了什么字段」「回包多了什么计数」
```

「既有失败基线」要记住：本项目 core 全量里一直有若干项失败（公益小红花、客户端版本、TSDK、QQ/微信登录等），做改动前先跑一遍记下失败集合，改完只对比集合有没有变大，不要被既有红点带偏。

---

## 8. 自力更生的六条铁律

1. **只信实机抓包，不信推测。** 界面上的数字是最好的校验器：价格、余额、数量三项能对上，协议才算通了。
2. **语义没证据就叫 `field_N`。** 猜错的字段会被上层当真，比缺失危险十倍。
3. **布尔永远按三态处理。** 「没下发」不等于 `false`。
4. **写操作必须闭口。** 数量/金额/余额对不上就停手，不重试，不猜。
5. **每个结论都留证据。** proto 注释里写抓包时间和实机数值，文档里写版本号和哈希。半年后回来看，这些注释就是唯一的资产。
6. **能查到价 ≠ 能卖进去。** 服务端随时可能加校验（分享标识就是例子），候选池的准入条件要按「拿得到成交所需凭据」来定，不能按「查得到数据」来定。

---

## 9. 附：以薯换福实战时间线

| 步骤 | 做了什么 | 产出 |
| --- | --- | --- |
| 1 | 微信小程序包里抠 `ItemInfo.json`，定位红薯种子 `item_id 20307`，下载对应图标 | `core/src/gameConfig/`、`seed_images/20307.png` |
| 2 | 抓包，解出 `Operate` 的 cmd 91–99 与槽位 `100+cmd` | `activitypb.proto` 的 Yshf 段 |
| 3 | 差分 `GetGroup` 定位状态槽 130 及 8 个子槽，用 111+33=144 交叉验证 | 状态语义表 |
| 4 | 写服务层，暴露领种子/卖薯/查行情/兑换/分享/提成 9 个方法 | `services/activity-center/yishuhuanfu.ts` |
| 5 | 五个注册点接线，活动出现在目录里且按钮可用 | `activity-center.ts`、`activity-gameplay-registry.ts`、`worker.ts`、admin routes、`shared-state.ts` |
| 6 | 自动任务：10 分钟一轮、相位 4、首跑 260s，领种子/分享/卖薯/领提成 | `services/yishuhuanfu-auto.ts` |
| 7 | 前端页面 + Tab + store，设置页新增卡片 | `web/src/views/activity-center/YishuHuanfuActivityPage.vue` 等 |
| 8 | 三件套测试 58 项，实机修正（面板好友池、选中铺子被重置、漏卖最高价） | `core/tests/yishuhuanfu-*.test.js` |
| 9 | 活动第 4 天服务端热更：卖好友要带分享标识、目录开始下发已兑次数 → 协议加 `YshfShopRef`、标识落盘、候选池收窄、限购改 `x/y` | `yishu-share-keys.ts`、`yishuhuanfu.ts`、`YishuHuanfuTab.vue` |

自动任务上线后的观察点：日志 `event=以薯换福自动` 里，领种子/分享每天各一次成功、卖薯按价格降序且单轮不超过 3 家、提成到账后一轮内被领掉、每轮比价日志能看到候选池/扫描数/前 5 名价格。
