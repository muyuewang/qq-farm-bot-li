# 2026-11-25 以薯换福：命令号、状态槽与自动任务

## 协议索引

活动组 `2026111707`，主活动 `2026111708`，全部走 `gamepb.activitypb.ActivityService.Operate`，
命令号放在请求的 `operate_type` / 回包的同名字段里对照校验。

| cmd | 用途 | 请求 | 回包槽位 |
| --- | --- | --- | --- |
| 91 | 领当日红薯种子 | 空 | `grant{item_id,count}` |
| 92 | 查铺子行情 | `shop_gid`（+ 好友铺子要带 `shop{activity_id,gid,share_key}`） | `yshf_shop.quote{base_price,bonus_price,quota,shop}` + `can_sell` |
| 93 | 卖蜜薯 | `shop_gid,count`（+ 卖好友要带 `shop{...}`） | `yshf_sell{count,price,total,quota,balance}` |
| 95 | 收购记录列表 | 空 | `yshf_records.records[]` |
| 96 | 兑换下单 | `index,count` | `yshf_exchange{price,grant,balance,count,exchanged}` |
| 97 | 兑换目录 | 空 | `yshf_catalog.goods[]` |
| 98 | 分享铺子 | 空 | `yshf_share{price,grant,shop{invite_key,shop_ref}}` |
| 99 | 领取收购提成 | 空 | `yshf_commission{amount,balance}` |

状态槽 `130` 的语义（早期版本理解反过，已按抓包改正）：

- `1` claims：`seed_claimed` / `share_claimed`，服务端的今日领取标记，比本地日期记账可靠；
- `2` share：`bonus` / `timestamp`，分享暴击加成与分享时间；
- `3` 福气币余额；`5` 基础收购价；`6` 暴击加成；`7` 铺子今日接收总量；
- `11` 待领提成；`13` 提成标志。

成交价 = 基础价 + 加成。实机 111 + 33 = 144（自己铺子，与 cmd 93 成交价一致），
99 + 66 = 165（好友铺子，与游戏界面「今日蜜薯收购价」一致）。

cmd 92 的整体回包（对应官方 `MapleMarketGetShopRsp`）：

```proto
message YshfShopQueryReply {
    YshfShopQuote quote = 1;   // base_price / bonus_price / quota / shop
    bool can_sell = 2;         // 这个铺子当前收不收薯
}
```

- `can_sell` 三态：true 可收 / false 明确拒收 / 回包没带字段（按可卖处理）。protobufjs 对 bool
  取默认 `false`，读值分不清「明确 0」和「没下发」，所以先用 `hasOwnProperty` 判存在；
  只有明确 false 才拦下，新错误码 `YSHF_SHOP_CLOSED`。
- 剩余额度读 `quote.quota`（=官方 `remain_quota`），每天上限 8000；`8000 - quota` 是已用量。
- 自家铺子不占好友额度：比价表这一行 `unlimited = true`，界面显示「还可收 不限」，
  「卖自己」按钮只受 `can_sell` 约束；好友行要 `can_sell !== false` 且 `quota > 0` 才能卖。

分享是两步：先 cmd 98，再 `gamepb.sharepb.ShareService.CheckCanShare` →
`ReportShare{field_1:28, field_4:2017}`，暴击加成要第二步才真正落地。第二步失败不阻断主流程，
但要把原因透出来，避免「分享没生效」被当成成功。

## 自动任务

`core/src/services/yishuhuanfu-auto.ts` 挂在 worker scheduler 上，10 分钟一轮（相位 4 分钟，
与节令 19、神秘商人 37、牧歌 11 错开），首跑 260s；整个任务串进 `automation-lock` 的同一把全局锁。

一轮只读一次活动状态，然后：

1. **领种子**：服务端 `seed_claimed` 为真就跳过，否则发一次 cmd 91；
2. **分享**：`share_claimed` 为真就跳过，否则发一次 cmd 98 + 分享上报；
3. **卖薯**（开关独立）：背包蜜薯达到「起卖数量」才进入比价；
4. **领提成**：`130.11 > 0` 且 `claimable` 才发一次 cmd 99，没有可领就跳过。

跳过原因按服务端日期去重，一天只记一行，不会把日志刷满。写操作回包未确认（数量/金额对不上）
就中止本轮，绝不重试猜结果。自动任务调用写接口时传 `withSnapshot:false`，不回建整份活动中心快照
（那是 7 个活动的读，代价远高于一次写）。

### 卖薯的比价与风控

比价就是 cmd 92 逐个查好友铺子（只读、不占对方额度），按 `totalPrice` 降序排：

- **好友数上限**（默认 50，可 1–200）：单轮最多扫这么多家；自动卖薯另有一条下限
  `AUTO_SCAN_MIN_LIMIT = 50`，即使旧配置写成 20 也按 50 扫，避免候选池后半段的最优价
  被永久挡在窗口外（曾出现「有 372 的铺子却卖了 299」）；
- **比价间隔**（默认 120 分钟，可 5–720）：间隔内复用上一轮的排序结果，不重复扫；
- **贪心换铺**：最高价那家额度够就一次卖完；不够就吃满它的剩余额度，再换第二高，依次往下；
- **单轮上限**：最多切 3 家铺子，笔间隔 1200ms，剩下的留到下一轮；
- **兜底**：好友都收满时默认把剩下的卖给自己铺子（可关）。

「额度不足 / 铺子查不到」只换下一家，不算失败；回包金额不符这类错误直接停手。

每轮比价会打一条 `event=以薯换福自动` 的 `action=scan` 明细日志：候选池家数、本轮扫描家数、
剩余待轮换家数、前 5 名「名称:总价」，用来核查「最高价到底有没有进窗口」。

好友池是**面板所有账号的好友**汇总（`core/data/known_friend_gids/<accountId>.json` 全量去重），
不只是当前账号的好友；候选池超过上限时按 `friendScanRotation` 游标滚动扫描。

## 配置项

`automation` 里的开关（默认全开）：

- `yishu_claim_seed`、`yishu_share`、`yishu_claim_commission`、`yishu_auto_sell`；
- `yishu_sell_fallback_own`（默认 true）；
- `yishu_scan_friend_limit`（50）、`yishu_scan_interval_minutes`（120）、`yishu_sell_min_count`（1）；
- `yishu_sell_after_time`（默认 `'14:00'`，空串表示不限制）：到点后才开始售卖比价。
  它是 `"HH:MM"` 字符串，归一化时必须走 `normalizeSellAfterTime`，否则会被通用 `!!value` 折成 `true`。

数值项在 `normalizeAutomationValue` 里显式夹取，否则会被通用的 `!!value` 折成 `true`（与
`fertilizer_smart_seconds` 同一个坑）。设置页在「牧歌初启」与「神秘商人」之间新增以薯换福卡片。

## 验证

- 固定抓包数值：144 = 111 + 33、165 = 99 + 66、记录 `total=4320 / commission=86`、`130.11=86`、
  cmd 99 回包 `32156`；
- `core/tests/yishuhuanfu-proto.test.js`、`yishuhuanfu-service.test.js`、`yishuhuanfu-auto.test.js`
  共 58 项；自动任务侧钉死「已领过不再写」「按价换铺」「单轮最多 3 家」「比价节流」「余额阈值」
  「配置上限太小也要扫满 50 家并选中最高价」；
- 全量 core 446 项 / 通过 437 / 失败 9（既有 9 项不变），前端 33 项通过；`typecheck:web`、
  `build:core`、`build:web` 通过。

自动化部分只有离线的桩调用验证，尚未在实服跑满一天；实服观察点在日志 `event=以薯换福自动`：
领种子/分享每天各一次成功、卖薯按价格降序且不超过 3 家、提成到账后一轮内被领掉。

## 2026-11-28 热更：分享标识与兑换剩余次数

游戏客户端 `1.17.1.13` 在活动期内改了服务端校验，两处必须跟着改，否则「卖给别人」和「兑换次数」都会失真。抓包：`gate-obt.nqf.qq.com` 2026-11-28 15:29:54（187 帧，含 8 条 Operate）。

### 一、卖进好友铺子必须带当天的分享标识

每天分享（cmd 98）后，分享出去的铺子卡片里带一个当天唯一的 `share_key`（UUID 形式，实机 `0d0e525c-1f3e-4133-89d6-da336d845e29`）。别人点卡片进来卖薯时，必须原样回传：

```proto
message YshfShopRef { int64 activity_id = 1; int64 gid = 2; string share_key = 3; }
// cmd 92 请求 params：1=shop_gid、2=shop(YshfShopRef)
// cmd 93 请求 params：1=shop_gid、2=count、3=shop(YshfShopRef)
```

实机对比（同一个好友 1092751293）：

- 查行情（cmd 92）只带 gid 的回包还是旧的铺主信息，但**卖薯会被拒**——这正是「以前按 gid 强卖」失效的原因；
- 带 `shop{gid,share_key}` 后 cmd 93 正常成交：`600 × 309 = 185400`，额度 7820 → 7220，与界面「恭喜获得 18万 福气币」逐项对上。

**别拿错 key。** cmd 98 回包里有两个容易混的值：

| 位置 | 值（实机） | 是什么 |
| --- | --- | --- |
| `shop.invite_key`（2 号位） | `52ab5e16994b4110b4c7ff79367fce03` | 32 位邀请码，与 `FriendService.GetShareKey` 同值，不能用于卖薯 |
| `shop.shop_ref.share_key`（5 号位） | `0d0e525c-1f3e-4133-89d6-da336d845e29` | 分享卡片里的标识，卖薯要回传的就是它 |

早期 proto 把 2 号位当成 `share_key`，所以就算读出来也永远对不上。

### 二、查价也要标识，候选池唯一来源是标识存档

同一天下午复测发现，**cmd 92 也认标识了**：不带 `shop` 去查别人的 gid，服务端不报错，直接把
**自己铺子的行情**原样返回，回包结构和好友铺子完全一样。这是最坑的一点——照单全收会把
「自己的 441」记成对方的价，整张比价表全是假数据，卖过去还会被 cmd 93 拒。

服务端没有「按 gid 反查好友标识」的接口，`GetShareKey` 给的是另一个值（32 位邀请码）。
所以数据链路收敛成一条：

- 面板里挂的每个账号每天分享一次，cmd 98 回包里的 `{gid, share_key}` 自动落盘到
  `core/data/yishu_share_keys/<gid>.json`；
- `listYishuShareKeys()` 把目录下所有 `<gid>.json` 并成一张表，**这张表就是比价池**；
- 物理上按 gid 一文件、逻辑上是一块：每个账号的 worker 只写自己那份，
  多进程同时跑也不会互相覆盖（写同一个 JSON 就会丢标识）；
- 没有标识的 gid 一律**不发 cmd 92**（`fetchShopQuote` 直接抛 `YSHF_SHARE_KEY_MISSING`），
  宁可空着也不把假数据放进比价表；
- 好友列表这条线彻底不走：好友的 share_key 拿不到，并进候选池只会白跑。`includeFriends`
  参数保留但已无效果。

跨日自动失效：`dateKey` 对不上就当没有（`staleKeyCount` 会把过期条数报给界面）。

面板外的真人好友只能手动补：前端「分享标识」输入框贴对方分享的链接/卡片文本，
后端用正则提取 UUID 后落盘（`POST /api/activity-center/yishuhuanfu/share-key`），
写完立刻 `force` 重扫一次比价。

**运维含义**：想比价几家，就得有几家今天分享过。面板账号把「自动-分享铺子」打开即可每天自动补；
**今天已经分享过但标识没落盘的号不用等到明天**——再分享一次仍会成功，只是没有暴击加成和种子奖励，
当天标识固定不变，补一次就够。后端据此把 `daily.shareKeySaved` 下发给界面：已分享但没标识时，
分享按钮改成「补分享标识」并可点；自动任务同样会补一次（每天只试一次，避免服务端当天不下发
`shop_ref` 时每轮白打网关）。

### 三、兑换档位的剩余次数（cmd 97 field 6 / cmd 96 field 4-5）

`YshfCatalogGoods` 的 6 号位是**累计已兑换次数**，不是布尔标记：

- cmd 97：`limit = 28`、`exchanged = 13` → 游戏界面「限购 15/28」（28 − 13）；
- 兑换 3 次后 cmd 96 回包：`count = 3`（4 号位）、`exchanged = 16`（5 号位）→ 界面「限购 12/28」（28 − 16）。

所以剩余可兑 = `limit − exchanged`，界面必须显示 `剩余/上限`，兑换成功后要重拉 cmd 97（目录不在活动快照里，不重拉就一直挂着兑换前的次数）。7 号位除第 1 档外恒为 1，与是否兑换过不对应，语义仍未取证，未做断言。

### 四、代码落点

| 改动 | 文件 |
| --- | --- |
| `YshfShopRef` 与两个请求的 shop 字段、`YshfSelfShop` 重新定名、目录/兑换回包字段 | `core/src/proto/activitypb.proto` |
| 标识存档（读写、跨日校验、链接解析） | `core/src/models/store/yishu-share-keys.ts`、`shared-state.ts` 的 `YISHU_SHARE_KEYS_DIR` |
| 查行情/卖薯带 shop 引用、分享落盘、目录剩余量、兑换回写、导入接口 | `core/src/services/activity-center/yishuhuanfu.ts` |
| 候选池 = 标识存档里的 gid（好友列表不再参与） | 同上 `scanYishuHuanfuFriendShops` |
| 无标识时拒绝查价（避免把自家行情当成对方价） | 同上 `fetchShopQuote` |
| 自动卖薯不再二次筛标识（池子已保证可卖） | `core/src/services/yishuhuanfu-auto.ts` |
| 限购 `x/y`、未分享标记与按钮禁用、标识粘贴框 | `web/src/components/activity/YishuHuanfuTab.vue`、`web/src/stores/activity-center.ts` |
| 比价行完整展示 `share_key`（含自己那条）、行尾「移出比价」 | 同上 |
| 移出比价：`removeYishuShareKey` → `forgetYishuHuanfuShareKey` → `POST /yishuhuanfu/share-key/remove` | `core/src/models/store/yishu-share-keys.ts`、服务、`yishuhuanfu-routes.ts` |
| 写接口不回快照时保住活动详情（否则页面变空壳） | `web/src/stores/activity-center.ts` 的 `DETAIL_SNAPSHOT_KEYS` |
