# 2026-11-25 以薯换福：命令号、状态槽与自动任务

## 协议索引

活动组 `2026111707`，主活动 `2026111708`，全部走 `gamepb.activitypb.ActivityService.Operate`，
命令号放在请求的 `operate_type` / 回包的同名字段里对照校验。

| cmd | 用途 | 请求 | 回包槽位 |
| --- | --- | --- | --- |
| 91 | 领当日红薯种子 | 空 | `grant{item_id,count}` |
| 92 | 查铺子行情 | `shop_gid` | `yshf_shop.quote{base_price,bonus_price,quota,shop}` + `can_sell` |
| 93 | 卖蜜薯 | `shop_gid,count` | `yshf_sell{count,price,total,quota,balance}` |
| 95 | 收购记录列表 | 空 | `yshf_records.records[]` |
| 96 | 兑换下单 | `index,count` | `yshf_exchange{price,balance,grant}` |
| 97 | 兑换目录 | 空 | `yshf_catalog.goods[]` |
| 98 | 分享铺子 | 空 | `yshf_share{price,grant,shop.share_key}` |
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

- **好友数上限**（默认 20，可 1–50）：单轮最多扫这么多家；
- **比价间隔**（默认 30 分钟，可 5–720）：间隔内复用上一轮的排序结果，不重复扫；
- **贪心换铺**：最高价那家额度够就一次卖完；不够就吃满它的剩余额度，再换第二高，依次往下；
- **单轮上限**：最多切 3 家铺子，笔间隔 1200ms，剩下的留到下一轮；
- **兜底**：好友都收满时默认把剩下的卖给自己铺子（可关）。

「额度不足 / 铺子查不到」只换下一家，不算失败；回包金额不符这类错误直接停手。

## 配置项

`automation` 里的开关（默认全开）：

- `yishu_claim_seed`、`yishu_share`、`yishu_claim_commission`、`yishu_auto_sell`；
- `yishu_sell_fallback_own`（默认 true）；
- `yishu_scan_friend_limit`（20）、`yishu_scan_interval_minutes`（30）、`yishu_sell_min_count`（1）。

数值项在 `normalizeAutomationValue` 里显式夹取，否则会被通用的 `!!value` 折成 `true`（与
`fertilizer_smart_seconds` 同一个坑）。设置页在「牧歌初启」与「神秘商人」之间新增以薯换福卡片。

## 验证

- 固定抓包数值：144 = 111 + 33、165 = 99 + 66、记录 `total=4320 / commission=86`、`130.11=86`、
  cmd 99 回包 `32156`；
- `core/tests/yishuhuanfu-proto.test.js`、`yishuhuanfu-service.test.js`、`yishuhuanfu-auto.test.js`
  共 48 项；自动任务侧钉死「已领过不再写」「按价换铺」「单轮最多 3 家」「比价节流」「余额阈值」；
- 全量 core 429 项 / 通过 420 / 失败 9（既有 9 项不变），前端 26 项通过；`typecheck:web`、
  `build:core`、`build:web` 通过。

自动化部分只有离线的桩调用验证，尚未在实服跑满一天；实服观察点在日志 `event=以薯换福自动`：
领种子/分享每天各一次成功、卖薯按价格降序且不超过 3 家、提成到账后一轮内被领掉。
