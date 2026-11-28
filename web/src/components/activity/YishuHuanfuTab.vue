<script setup lang="ts">
import type { YishuHuanfuActivityDto, YishuHuanfuCatalogEntryDto, YishuHuanfuFriendShopDto, YishuHuanfuRecordDto } from '@/stores/activity-center'
import { computed, ref } from 'vue'

const props = defineProps<{
  activity: YishuHuanfuActivityDto | null
  pendingSeed: boolean
  pendingSell: boolean
  pendingShare: boolean
  pendingExchange: boolean
  pendingQuote: boolean
  pendingCommission: boolean
  pendingImportKey: boolean
  friendShops: YishuHuanfuFriendShopDto[]
  friendShopsLoading: boolean
  friendScanAt: number
  friendScanNote: string
  records: YishuHuanfuRecordDto[]
  recordsLoading: boolean
  recordsNote: string
  // 手动填 GID 查到的铺子行情（cmd 92）：陌生人铺子也能收蜜薯，不限于好友列表。
  targetQuote: YishuHuanfuFriendShopDto | null
  targetQuoteLoading: boolean
  targetQuoteNote: string
  // 回执对应的 GID：输入框改号后旧提示要隐藏，避免把上一个号码的行情当成这次的。
  targetQuoteGid: string
}>()

const emit = defineEmits<{
  claimSeed: []
  sell: [payload: { friendGid: string, count: number | null }]
  queryShop: [gid: string]
  share: []
  exchange: [index: number, count: number]
  scanFriends: [force: boolean]
  refreshShop: []
  refreshQuote: []
  claimCommission: []
  loadRecords: []
  // 手动导入好友当天分享标识：贴分享链接/卡片文本或 UUID。
  importShareKey: [gid: string, text: string]
}>()

type TabKey = 'shop' | 'store' | 'compare'

const tab = ref<TabKey>('shop')
const sellCountText = ref('')
// 空字符串代表卖给自己铺子。
const targetGid = ref('')

const busy = computed(() => props.pendingSeed || props.pendingSell || props.pendingShare || props.pendingExchange || props.pendingQuote || props.pendingCommission)
const activity = computed(() => props.activity)
const basePrice = computed(() => activity.value?.shop.price || '0')
const bonus = computed(() => activity.value?.shop.bonus || '0')
const priceKnown = computed(() => !!activity.value?.shop.priceKnown)
const estimatedPrice = computed(() => activity.value?.shop.estimatedPrice || null)
// 顶部大字用预计成交价；没有加成数据时退回基础价。
const displayPrice = computed(() => estimatedPrice.value || basePrice.value)
const sweetPotato = computed(() => activity.value?.sweetPotatoBalance ?? null)
const sweetPotatoCount = computed(() => Number(sweetPotato.value || '0'))
const luckCoin = computed(() => Number(activity.value?.luckCoinBalance ?? '0'))
const canSell = computed(() => !!activity.value?.actions.sell.enabled && sweetPotatoCount.value > 0)
// 已分享 ≠ 标识已落盘。真实情况是「今天分享过，但那串 share_key 没被记下来」
// （进程重启、版本更新之前分享的）。这种账号还能再分享一次，只补标识、没有奖励。
const shareKeyPending = computed(() => !!activity.value?.daily.shared && !activity.value?.daily.shareKeySaved)
const shareStateText = computed(() => {
  const daily = activity.value?.daily
  if (!daily?.shared)
    return '分享可触发暴击'
  return daily.shareKeySaved ? '今日已分享' : '已分享·标识未记录'
})
const shareButtonText = computed(() => {
  if (props.pendingShare)
    return '分享中…'
  const daily = activity.value?.daily
  if (!daily?.shared)
    return '分享收购价'
  return daily.shareKeySaved ? '今日已分享' : '补分享标识'
})
const catalog = computed(() => activity.value?.catalog || [])
const canExchange = computed(() => !!activity.value?.actions.exchange.enabled)
// 资源条只留福气币与蜜薯：红薯种子每天固定 28 个、只影响种植，读不到也不影响做决策，
// 之前它一失败就把整排打成 "--"，干脆不展示，避免一个低价值字段拖累整块数据。
// 判定直接看数值是否为 null，不再依赖后端 known 标记，少一层可能对不上的字段。
const walletKnown = computed(() => {
  const value = activity.value
  if (!value)
    return false
  return value.sweetPotatoBalance !== null && value.sweetPotatoBalance !== undefined
})
const walletError = computed(() => activity.value?.balanceError || '')
// 后端这次没读到背包，但沿用了上一次的成功值：继续显示数字，只做弱提示，不报错。
const walletStale = computed(() => !!activity.value?.balanceStale)

/** 收购记录时间戳是秒；界面按「刚刚 / N 分钟前 / N 小时前 / N 天前」显示。 */
function formatRecordTime(value: string) {
  const seconds = Number(value || '0')
  if (!Number.isFinite(seconds) || seconds <= 0)
    return ''
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

const quota = computed(() => activity.value?.shop.quota ?? null)
const quotaCap = computed(() => Number(activity.value?.shop.quotaCap || '0'))
const quotaUsed = computed(() => {
  if (activity.value?.shop.quotaUsed !== null && activity.value?.shop.quotaUsed !== undefined)
    return Number(activity.value.shop.quotaUsed)
  if (quota.value === null)
    return null
  return Math.max(0, quotaCap.value - Number(quota.value))
})
const quotaPercent = computed(() => {
  if (quotaUsed.value === null || quotaCap.value <= 0)
    return 0
  return Math.min(100, Math.round((quotaUsed.value / quotaCap.value) * 100))
})

// 选择了好友铺子就按对方报价预估；否则按自己铺子的预计成交价。
// 手动填的 GID 可能不在好友列表里，此时用单独查到的 cmd 92 行情兜底。
const manualQuoteMatch = computed(() => {
  const quote = props.targetQuote
  if (!quote || !targetGid.value)
    return null
  return quote.gid === targetGid.value ? quote : null
})
const targetShop = computed(() => {
  if (!targetGid.value)
    return null
  // 手动查到的行情优先：它是刚点「查行情」拉回来的那一份，比列表里的新。
  // 列表里那份的 shareKeyKnown 可能还是补标识之前的旧值，拿它判断会让输入框收不起来。
  return manualQuoteMatch.value || props.friendShops.find(entry => entry.gid === targetGid.value) || null
})

/** GID 只允许数字：粘贴带空格的号码时直接清掉，省得后端报「参数无效」。 */
function onGidInput(value: string) {
  const next = String(value || '').replace(/\D/g, '').slice(0, 20)
  // 换了号码，上一个号贴进来的分享标识就作废了，别让「保存」把它写到新号头上。
  // 标识输入框只有填了 GID 才会出现，所以这里清空不会误伤「先贴标识再填号」的情况。
  if (next !== targetGid.value)
    resetShareKeyInput()
  targetGid.value = next
}

function resetShareKeyInput() {
  shareKeyText.value = ''
  shareKeyEditing.value = false
}

function queryTargetQuote() {
  const gid = targetGid.value.trim()
  if (!gid || props.targetQuoteLoading)
    return
  emit('queryShop', gid)
}
const targetLabel = computed(() => {
  if (!targetGid.value)
    return '自己的铺子'
  const shop = targetShop.value
  return shop ? `${shop.name || shop.gid} 的铺子` : `GID ${targetGid.value} 的铺子`
})
const unitPrice = computed(() => {
  if (targetShop.value)
    return Number(targetShop.value.totalPrice || targetShop.value.price || '0')
  return Number(estimatedPrice.value || basePrice.value || '0')
})

const sellCount = computed(() => {
  const raw = sellCountText.value.trim()
  if (!raw)
    return sweetPotatoCount.value
  const parsed = Math.floor(Number(raw))
  if (!Number.isFinite(parsed) || parsed <= 0)
    return 0
  return Math.min(parsed, sweetPotatoCount.value)
})
const expectedIncome = computed(() => sellCount.value * unitPrice.value)

// 目标铺子剩余额度不够时提示，避免白发一次请求；自家铺子不限量，不提示。
const targetQuota = computed(() => {
  if (!targetShop.value || targetShop.value.unlimited)
    return null
  return Number(targetShop.value.quota || '0')
})
const quotaShort = computed(() => targetQuota.value !== null && sellCount.value > targetQuota.value)
// can_sell 明确为 false 的铺子不能卖；null 表示回包没带该字段，按可卖处理。
const targetClosed = computed(() => targetShop.value?.canSell === false)

const ranking = computed(() => {
  const ownPrice = Number(estimatedPrice.value || basePrice.value || '0')
  const best = props.friendShops[0]
  if (!best)
    return ''
  const bestPrice = Number(best.totalPrice || best.price || '0')
  if (!ownPrice || bestPrice <= ownPrice)
    return ''
  return `${best.own ? '自己的' : (best.name || best.gid)} 铺子高 ${bestPrice - ownPrice} 一枚`
})

// 出售目标不在这里监听 activity/账号做自动重置：
// 账号或活动切换时父级 ActivityCenter.vue 会把 selectedActivity 置空、整页 v-if 卸载，
// 组件重建后 targetGid 自然归零。这里再 watch activityId 只会被轮询快照刷新误触发，
// 把用户刚选好的好友铺子清空、按钮悄悄变回「卖给自己」。

// 首次进入比价页时自动扫一轮，之后靠手动刷新，避免每次切页都打满请求。
function openCompare() {
  tab.value = 'compare'
  if (!props.friendShops.length && !props.friendShopsLoading)
    emit('scanFriends', false)
}

function pickTarget(gid: string) {
  if (gid !== targetGid.value)
    resetShareKeyInput()
  targetGid.value = gid
  tab.value = 'shop'
}

function fillMax() {
  sellCountText.value = String(sweetPotatoCount.value)
}

function submitSell() {
  if (!canSell.value || busy.value)
    return
  emit('sell', {
    friendGid: targetGid.value,
    // 空输入表示卖出背包全部，交给后端按当前余额裁决。
    count: sellCountText.value.trim() ? sellCount.value : null,
  })
}

// 兑换数量是逐档独立选择的：cmd 96 的 params 里本来就带 count，服务端按 count × 单价扣币。
// 兑换数量不再放在卡片上内联调整——卡片只留一个「兑换」按钮，
// 点开弹窗再填数量（参考同类工具的做法：避免误触一换就是多份）。
const exchangeTarget = ref<YishuHuanfuCatalogEntryDto | null>(null)
const exchangeQty = ref(1)
// 手动粘贴对方的分享标识（链接/卡片文本都行），用于面板外的真人好友。
const shareKeyText = ref('')
// 已经带上标识时默认折叠成一行状态，想换标识再点开输入框。
const shareKeyEditing = ref(false)

// 比价页的「手动添加铺子」：面板外的真人好友只能靠手填 gid + 标识进池。
const addShopOpen = ref(false)
const addShopGid = ref('')
const addShopKey = ref('')
const addShopValid = computed(() => /^\d{5,20}$/.test(addShopGid.value.trim()) && addShopKey.value.trim().length >= 16)

function toggleAddShop() {
  addShopOpen.value = !addShopOpen.value
  if (!addShopOpen.value) {
    addShopGid.value = ''
    addShopKey.value = ''
  }
}

function submitAddShop() {
  if (!addShopValid.value || props.pendingImportKey)
    return
  emit('importShareKey', addShopGid.value.trim(), addShopKey.value.trim())
  // 标识是一次性凭据，落盘后就没必要留在输入框里；GID 也清掉，避免重复提交同一个。
  addShopGid.value = ''
  addShopKey.value = ''
}

/** 标识太长（36 位 UUID），列表里只显示头尾，完整值放 title。 */
function shortKey(value: string) {
  const key = String(value || '')
  if (key.length <= 17)
    return key
  return `${key.slice(0, 8)}…${key.slice(-6)}`
}

// 2026-11-28 起卖给别人必须带对方当天的分享标识（服务端校验）。
// 自己的 GID 走自卖，不需要；填了别人的号就必须有。
const ownGid = computed(() => String(activity.value?.shop.gid || ''))
const needsShareKey = computed(() => {
  if (!targetGid.value)
    return false
  if (targetShop.value?.own)
    return false
  return targetGid.value !== ownGid.value
})

// 三态：true 已确认带上今日标识 / false 明确没有 / null 还没查行情、不知道。
// 关键点在 null 也要露出输入框：没标识时 cmd 92 可能查不到铺子，
// 若「查不到就不给输入框」，用户就永远补不上标识，售卖被卡死。
const targetKeyKnown = computed<boolean | null>(() => {
  if (!needsShareKey.value)
    return true
  const shop = targetShop.value
  if (!shop)
    return null
  return shop.shareKeyKnown !== false
})
const showShareKeyInput = computed(() => needsShareKey.value
  && (targetKeyKnown.value !== true || shareKeyEditing.value))
const shareKeyActionLabel = computed(() => {
  if (props.pendingImportKey)
    return '保存中…'
  if (targetKeyKnown.value === true)
    return '更新'
  return targetKeyKnown.value === null ? '保存并查询' : '保存'
})

// 换目标 GID 时把上一个号的标识原文丢掉，避免顺手贴到别人头上。
function submitShareKey() {
  const gid = targetGid.value.trim()
  const text = shareKeyText.value.trim()
  if (!gid || !text || props.pendingImportKey)
    return
  emit('importShareKey', gid, text)
  // 贴进来的原文只在这一步有用：后端会归一化成 UUID 落盘，保存后马上重查行情，
  // 成败都由行情回执说话，输入框留着原文反而会让人以为还没存进去。
  shareKeyText.value = ''
  shareKeyEditing.value = false
}

// 上限取「本档剩余可兑」和「福气币够买几次」的较小值；余额为 0 时仍然允许 1，交给服务端裁决。
// 剩余量用后端算好的 remaining（limit − 已兑换），兑换后会被回写，不能拿 limit 当剩余用。
function maxCountOf(entry: { index: number, price: string, limit: string, remaining: string }) {
  const price = Number(entry.price || '0')
  const limit = Number(entry.limit || '0')
  const remaining = Number(entry.remaining || '0')
  const byBalance = price > 0 ? Math.floor(luckCoin.value / price) : 1
  const byLimit = limit > 0 ? remaining : Number.POSITIVE_INFINITY
  const max = Math.min(Number.isFinite(byBalance) ? byBalance : 1, byLimit)
  return Math.max(1, Number.isFinite(max) ? Math.floor(max) : 1)
}

const exchangeMax = computed(() => (exchangeTarget.value ? maxCountOf(exchangeTarget.value) : 1))
const exchangeCost = computed(() => {
  const entry = exchangeTarget.value
  if (!entry)
    return 0
  return Math.max(0, Math.floor(exchangeQty.value || 0)) * Number(entry.price || '0')
})
const exchangeBalance = computed(() => Math.max(0, luckCoin.value - exchangeCost.value))

function openExchange(entry: YishuHuanfuCatalogEntryDto) {
  if (busy.value || !canExchange.value || !canExchangeEntry(entry))
    return
  exchangeTarget.value = entry
  exchangeQty.value = 1
}

function closeExchange() {
  if (busy.value)
    return
  exchangeTarget.value = null
}

function stepExchange(delta: number) {
  const current = Math.max(1, Math.floor(exchangeQty.value || 1))
  exchangeQty.value = Math.min(exchangeMax.value, Math.max(1, current + delta))
}

function confirmExchange() {
  const entry = exchangeTarget.value
  if (!entry)
    return
  const qty = Math.min(exchangeMax.value, Math.max(1, Math.floor(exchangeQty.value || 1)))
  emit('exchange', entry.index, qty)
  exchangeTarget.value = null
}

function canExchangeEntry(entry: { index: number, price: string, limit: string, remaining: string, exchangeable: boolean }) {
  if (!entry.exchangeable)
    return false
  // 剩余次数为 0 直接置灰，别再让用户点进弹窗后被后端拒一次。
  if (Number(entry.limit || '0') > 0 && Number(entry.remaining || '0') <= 0)
    return false
  // 余额没读到时不要一棍子打死：放行到下单接口，由后端按真实余额给出准话。
  if (activity.value?.luckCoinBalance === null || activity.value?.luckCoinBalance === undefined)
    return true
  return Number(entry.price || '0') <= luckCoin.value
}

function formatNumber(value: string | number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric))
    return String(value)
  return numeric.toLocaleString('zh-CN')
}

function formatPrice(value: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return value
  if (numeric >= 10000)
    return `${(numeric / 10000).toFixed(numeric % 10000 === 0 ? 0 : 1)}万`
  return numeric.toLocaleString('zh-CN')
}

function goodsTitle(entry: { index: number, name: string, nameKnown: boolean }) {
  return entry.nameKnown && entry.name ? entry.name : `兑换项 ${entry.index}`
}

function scanAgo() {
  if (!props.friendScanAt)
    return ''
  const seconds = Math.max(0, Math.round((Date.now() - props.friendScanAt) / 1000))
  if (seconds < 60)
    return `${seconds} 秒前`
  return `${Math.round(seconds / 60)} 分钟前`
}
</script>

<template>
  <div class="yshf-page">
    <!-- 资源条：标题与时间已经在页头，这里只留三份资源，避免同一个标题出现两次。 -->
    <section v-if="activity" class="yshf-wallet-bar">
      <div class="wallet-item">
        <img v-if="activity.luckCoin.image" :src="activity.luckCoin.image" alt="福气币">
        <b>{{ activity.luckCoinBalanceKnown ? formatNumber(activity.luckCoinBalance ?? '0') : '--' }}</b>
        <span>福气币</span>
      </div>
      <div class="wallet-item">
        <img v-if="activity.sweetPotato.image" :src="activity.sweetPotato.image" alt="蜜薯">
        <b>{{ activity.sweetPotatoBalanceKnown ? formatNumber(activity.sweetPotatoBalance ?? '0') : '--' }}</b>
        <span>蜜薯</span>
      </div>
      <p v-if="!walletKnown" class="wallet-error" :title="walletError">
        背包数量读取失败{{ walletError ? `：${walletError}` : '' }}，点右上角刷新重试
      </p>
      <p v-else-if="walletStale" class="wallet-stale">
        背包暂时没读到，以上为上次成功读取的数量，稍后会自动更新
      </p>
      <p v-else class="wallet-tagline">种红薯额外收蜜薯，卖蜜薯换福气币，再兑换限时好礼。</p>
    </section>

    <nav class="yshf-tabs">
      <button type="button" :class="{ active: tab === 'shop' }" @click="tab = 'shop'">
        红薯小铺
      </button>
      <button type="button" :class="{ active: tab === 'store' }" @click="tab = 'store'">
        兑换商店
      </button>
      <button type="button" :class="{ active: tab === 'compare' }" @click="openCompare">
        好友比价
      </button>
    </nav>

    <!-- 红薯小铺 -->
    <div v-if="tab === 'shop'" class="yshf-columns">
      <div class="yshf-column">
        <section v-if="activity" class="yshf-panel price-panel">
          <div class="price-head">
            <span>今日收购价</span>
            <em v-if="!priceKnown">行情未生成</em>
            <button type="button" class="link" :disabled="busy" @click="emit('refreshQuote')">
              {{ pendingQuote ? '刷新中…' : '刷新行情' }}
            </button>
          </div>
          <div class="price-main">
            <strong>{{ priceKnown ? formatNumber(displayPrice) : '--' }}</strong>
            <span>/ 个</span>
            <i v-if="priceKnown && bonus !== '0'">分享暴击 +{{ formatNumber(bonus) }}</i>
          </div>
          <div class="price-tags">
            <span>基础价 {{ formatNumber(basePrice) }}</span>
            <span v-if="bonus !== '0'">分享暴击 +{{ formatNumber(bonus) }}</span>
            <span>每日 24:00 按最终收购价结算剩余蜜薯</span>
          </div>
          <p class="price-hint">
            成交价以服务端结算为准，顶部为「基础价 + 分享暴击」的预估值。
          </p>
        </section>

        <section v-if="activity" class="yshf-panel quota-panel">
          <div class="quota-head">
            <span>小铺接收额度</span>
            <em v-if="quota === null" class="soft">未查询 <button type="button" class="link" :disabled="busy" @click="emit('refreshShop')">查询</button></em>
            <em v-else>{{ formatNumber(quotaUsed ?? 0) }} / {{ formatNumber(quotaCap) }}</em>
          </div>
          <div class="quota-bar">
            <i :style="{ width: `${quotaPercent}%` }" />
          </div>
          <div class="quota-foot">
            <span>还可收购 {{ quota === null ? '--' : formatNumber(quota) }} 个</span>
            <span class="soft">好友卖进你的铺子会消耗额度</span>
          </div>
        </section>

        <section v-if="activity" class="yshf-panel daily-panel">
          <div class="section-heading">
            <div>
              <span>每日动作</span>
              <strong>{{ activity.daily.seedClaimed ? '种子已领' : '待领种子' }}</strong>
            </div>
            <em class="soft">{{ shareStateText }}</em>
          </div>
          <!-- 种子是否已领改由服务端状态槽 130.1 的 claims.seed_claimed 直接给出，
               不再需要“行情已生成”这种间接提示。 -->
          <p v-if="activity.daily.sharedToday && !activity.daily.seedClaimed" class="daily-note">
            今天已经触发过分享暴击，但还没领种子——两者互相独立，点下面按钮即可领取。
          </p>
          <div class="daily-actions">
            <button
              type="button"
              class="yshf-button primary"
              :disabled="busy || !activity.actions.claimSeed.enabled"
              @click="emit('claimSeed')"
            >
              {{ activity.daily.seedClaimed ? '今日已领取' : (pendingSeed ? '领取中…' : '领取今日红薯种子') }}
            </button>
            <button
              type="button"
              class="yshf-button ghost"
              :disabled="busy || !activity.actions.share.enabled"
              @click="emit('share')"
            >
              {{ shareButtonText }}
            </button>
          </div>
          <!-- 已分享 ≠ 标识已落盘：分享过但没有本地标识的账号，再点一次只补标识，
               没有暴击加成与种子奖励（当天标识固定不变，所以补一次就够）。 -->
          <p v-if="shareKeyPending" class="daily-note">
            今天已经分享过，但这次的分享标识没记下来（进程重启或版本更新前分享的）。
            再点一次「补分享标识」即可：当天标识固定不变，只是不会再有暴击加成和种子奖励。
          </p>
        </section>

        <section class="yshf-panel commission-panel">
          <div class="section-heading">
            <div>
              <span>小铺提成</span>
              <strong>{{ formatNumber(activity?.commission.pending ?? '0') }} 福气币可领</strong>
            </div>
            <button
              type="button"
              class="commission-claim"
              :disabled="busy || !activity?.commission.claimable"
              @click="emit('claimCommission')"
            >
              {{ activity?.commission.claimable ? '领取提成' : '暂无可领' }}
            </button>
          </div>
          <p class="commission-text">
            好友把蜜薯卖进你的铺子后，你会按比例拿到提成（实机按成交额约 2%）；自己卖给自己不产生提成。
          </p>

          <div class="record-head">
            <span>收购记录</span>
            <em>只展示最近 30 条</em>
            <button type="button" class="record-refresh" :disabled="recordsLoading" @click="emit('loadRecords')">
              {{ recordsLoading ? '读取中…' : '刷新' }}
            </button>
          </div>
          <ul v-if="records.length" class="record-list">
            <li v-for="entry in records" :key="`${entry.gid}-${entry.timestamp}`">
              <img v-if="entry.avatar" :src="entry.avatar" :alt="entry.name">
              <div class="record-main">
                <strong>{{ entry.name || entry.gid }}</strong>
                <span>收购 {{ formatNumber(entry.count) }} 个 · 支出 {{ formatNumber(entry.total) }}</span>
              </div>
              <div class="record-side">
                <b>+{{ formatNumber(entry.commission) }}</b>
                <em>{{ formatRecordTime(entry.timestamp) }}</em>
              </div>
            </li>
          </ul>
          <p v-else class="record-empty">
            {{ recordsLoading ? '正在读取收购记录…' : (recordsNote || '暂无收购记录，好友把蜜薯卖进你的铺子后会出现在这里') }}
          </p>
        </section>
      </div>

      <aside class="yshf-column side">
        <section class="yshf-panel sell-panel">
          <div class="section-heading">
            <div>
              <span>出售蜜薯</span>
              <strong>{{ targetLabel }}</strong>
            </div>
            <button v-if="targetGid" type="button" class="link" @click="targetGid = ''">
              改回自己
            </button>
          </div>

          <div class="sell-row">
            <span>目标单价</span>
            <strong>{{ formatNumber(unitPrice) }} 福气币 / 个</strong>
          </div>
          <div class="sell-row">
            <span>可用蜜薯</span>
            <strong>{{ activity?.sweetPotatoBalanceKnown ? formatNumber(sweetPotatoCount) : '--' }} 个</strong>
          </div>

          <!-- 蜜薯不只能卖给好友：只要对方开着铺子，陌生人也能收。这里手填 GID 卖给他。 -->
          <label class="sell-input">
            <span>目标 GID</span>
            <input
              :value="targetGid"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="留空 = 卖给自己"
              @input="onGidInput(($event.target as HTMLInputElement).value)"
            >
            <button
              type="button"
              class="link"
              :disabled="targetQuoteLoading || !targetGid"
              @click="queryTargetQuote"
            >
              {{ targetQuoteLoading ? '查询中…' : '查行情' }}
            </button>
          </label>
          <p v-if="targetQuoteNote && targetQuoteGid === targetGid" class="sell-hint" :class="{ warning: targetClosed }">
            {{ targetQuoteNote }}
          </p>
          <p v-else-if="targetGid && !targetShop" class="sell-hint">
            填好 GID 后点「查行情」，先确认单价和剩余额度再卖。
          </p>

          <!-- 2026-11-28 起卖给别人要带对方当天的分享标识；面板外的真人好友只能手动贴一次。
               面板账号会自己分享、标识自动落盘，所以填自己或面板账号时不会出现这一行。
               判定只看「GID 是不是别人的」——不依赖是否已查到行情，否则没标识就查不到铺子、
               查不到铺子又不给输入框，会把售卖锁死。 -->
          <template v-if="needsShareKey">
            <div v-if="targetKeyKnown === true && !showShareKeyInput" class="share-key-state">
              <span>
                已带对方今日分享标识
                <em v-if="targetShop?.shareKey" class="share-key-text" :title="targetShop.shareKey">{{ shortKey(targetShop.shareKey) }}</em>
              </span>
              <button type="button" class="link" @click="shareKeyEditing = true">
                换一个
              </button>
            </div>
            <template v-else>
              <label class="sell-input">
                <span>分享标识</span>
                <input
                  v-model="shareKeyText"
                  type="text"
                  autocomplete="off"
                  placeholder="粘贴对方分享的链接或标识"
                >
                <button
                  type="button"
                  class="link"
                  :disabled="pendingImportKey || !shareKeyText.trim()"
                  @click="submitShareKey"
                >
                  {{ shareKeyActionLabel }}
                </button>
              </label>
              <p class="sell-hint" :class="{ warning: targetKeyKnown === false }">
                <template v-if="targetKeyKnown === false">
                  这家没有今天的分享标识，服务端会拒收。让对方在游戏里分享一次铺子，或把对方分享的链接贴进来。
                </template>
                <template v-else>
                  卖给好友要带对方当天的分享标识：贴对方分享的链接或 UUID，保存后自动查一次行情。
                </template>
              </p>
            </template>
          </template>

          <label class="sell-input">
            <span>出售数量</span>
            <input
              v-model="sellCountText"
              type="number"
              min="1"
              :max="sweetPotatoCount"
              :placeholder="`全部 ${formatNumber(sweetPotatoCount)}`"
              inputmode="numeric"
            >
            <button type="button" class="link" @click="fillMax">最大</button>
          </label>

          <div class="sell-row total">
            <span>预计收益</span>
            <strong>{{ formatNumber(expectedIncome) }} 福气币</strong>
          </div>
          <p v-if="targetClosed" class="sell-warning">
            这家铺子当前不收蜜薯（can_sell = false），换一家或卖给自己。
          </p>
          <p v-else-if="quotaShort" class="sell-warning">
            目标铺子今日只剩 {{ formatNumber(targetQuota ?? 0) }} 个接收额度，超出部分可能卖不掉。
          </p>

          <button
            type="button"
            class="yshf-button primary wide"
            :disabled="busy || !canSell || sellCount <= 0 || targetClosed || (needsShareKey && targetKeyKnown === false)"
            @click="submitSell"
          >
            {{ pendingSell ? '出售中…' : (targetGid ? '卖给他' : '卖给自己') }}
          </button>
          <button type="button" class="yshf-button ghost wide" @click="openCompare">
            去好友铺子看看谁更划算
          </button>
        </section>
      </aside>
    </div>

    <!-- 兑换商店 -->
    <section v-else-if="tab === 'store'" class="yshf-panel catalog-panel">
      <div class="section-heading">
        <div>
          <span>兑换商店</span>
          <strong>{{ catalog.length ? `${catalog.length} 档` : '未加载' }}</strong>
        </div>
        <em class="soft">当前福气币 {{ formatNumber(luckCoin) }}</em>
      </div>
      <div v-if="catalog.length" class="catalog-grid">
        <article v-for="entry in catalog" :key="entry.index" class="catalog-card">
          <div class="catalog-thumb">
            <img v-if="entry.image" :src="entry.image" :alt="goodsTitle(entry)">
            <span v-else class="catalog-placeholder">#{{ entry.index }}</span>
          </div>
          <p class="catalog-name">{{ goodsTitle(entry) }}</p>
          <p class="catalog-limit">限购 {{ entry.remaining }}/{{ entry.limit }}</p>
          <p class="catalog-price">{{ formatPrice(entry.price) }} 福气币 / 次</p>
          <button
            type="button"
            class="catalog-buy"
            :disabled="busy || !canExchange || !canExchangeEntry(entry)"
            @click="openExchange(entry)"
          >
            {{ canExchangeEntry(entry) ? '兑换' : (entry.exchangeable ? '福气币不足' : '暂不可兑') }}
          </button>
        </article>
      </div>
      <p v-else class="catalog-empty">
        目录需要单独查询一次，活动详情加载后再刷新即可看到。
      </p>
    </section>

    <!-- 好友比价 -->
    <section v-else class="yshf-panel compare-panel">
      <div class="section-heading">
        <div>
          <span>好友铺子比价</span>
          <strong>{{ friendShops.length ? `${friendShops.length} 个` : '未扫描' }}</strong>
        </div>
        <button
          type="button"
          class="yshf-button ghost compact"
          :disabled="friendShopsLoading || busy"
          @click="emit('scanFriends', true)"
        >
          {{ friendShopsLoading ? '扫描中…' : '重新比价' }}
        </button>
      </div>
      <p class="compare-hint">
        比价池 = 本账号 + 面板里当天分享过的账号（每个账号分享后，它的 gid 和分享标识会自动落盘）。
        2026-11-28 起连查价都要带对方标识：不带标识去查别人的 GID，服务端只会退回自己铺子的数据，
        所以面板外的好友要先贴一次他的分享链接才能进池。
        {{ ranking || '挑个价高的铺子卖，比卖给自己更划算。' }}
      </p>

      <!-- 面板外的真人好友：手填 GID + 标识进池。标识一次有效一天，跨日重新分享。 -->
      <div class="compare-add">
        <button
          type="button"
          class="yshf-button ghost compact"
          :disabled="friendShopsLoading"
          @click="toggleAddShop"
        >
          {{ addShopOpen ? '收起' : '＋ 手动添加铺子' }}
        </button>
        <div v-if="addShopOpen" class="compare-add__form">
          <input
            v-model="addShopGid"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="对方 GID"
            @input="addShopGid = String(($event.target as HTMLInputElement).value || '').replace(/\D/g, '').slice(0, 20)"
          >
          <input
            v-model="addShopKey"
            type="text"
            autocomplete="off"
            placeholder="对方分享的链接或标识"
          >
          <button
            type="button"
            class="catalog-buy narrow"
            :disabled="!addShopValid || pendingImportKey"
            @click="submitAddShop"
          >
            {{ pendingImportKey ? '保存中…' : '加入比价' }}
          </button>
        </div>
      </div>

      <p v-if="friendScanNote" class="compare-note">{{ friendScanNote }}<template v-if="friendScanAt">（{{ scanAgo() }}）</template></p>

      <div v-if="friendShops.length" class="compare-list">
        <article v-for="(shop, index) in friendShops" :key="shop.gid" class="compare-row">
          <span class="rank">{{ index + 1 }}</span>
          <div class="who">
            <strong>
              {{ shop.name || shop.gid }}
              <em v-if="shop.own">自己</em>
              <em v-else-if="shop.shareKeySource === 'manual'" class="panel-source" title="手动填进来的标识，如果查价 / 卖薯报错，先怀疑这条">手填</em>
              <em v-else-if="shop.via === 'panel'" class="panel-source" title="该账号自己分享后自动落盘的标识">已分享</em>
            </strong>
            <span>GID {{ shop.gid }}</span>
            <!-- 标识原样显示（截断，完整值在 title 里）：用户靠它核对这家是哪条链接进来的。 -->
            <span v-if="shop.shareKey" class="share-key-text" :title="shop.shareKey">标识 {{ shortKey(shop.shareKey) }}</span>
          </div>
          <div class="quote">
            <strong>{{ formatNumber(shop.totalPrice) }}</strong>
            <span>基础 {{ formatNumber(shop.price) }} + 加成 {{ formatNumber(shop.bonus) }}</span>
            <span v-if="shop.unlimited">还可收 不限</span>
            <span v-else>还可收 {{ formatNumber(shop.quota) }}</span>
            <span v-if="shop.canSell === false" class="closed">当前不收</span>
            <span v-else-if="!shop.shareKeyKnown" class="closed" title="2026-11-28 起，卖给好友要带对方当天的分享标识">未分享·只能看价</span>
          </div>
          <button
            type="button"
            class="catalog-buy narrow"
            :disabled="shop.canSell === false || !shop.shareKeyKnown || (!shop.unlimited && Number(shop.quota || '0') <= 0)"
            @click="pickTarget(shop.own ? '' : shop.gid)"
          >
            {{ shop.own ? '卖自己' : '卖给他' }}
          </button>
        </article>
      </div>
      <p v-else-if="!friendShopsLoading" class="catalog-empty">
        还没有比价结果，点「重新比价」扫一遍自己和面板账号的铺子。
      </p>
    </section>

    <section v-if="activity?.rules?.paragraphs?.length" class="yshf-panel rules-panel">
      <div class="section-heading">
        <div>
          <span>{{ activity.rules.title || '活动说明' }}</span>
        </div>
      </div>
      <p v-for="(line, index) in activity.rules.paragraphs" :key="index" class="rules-line">
        {{ line }}
      </p>
    </section>
  </div>

  <!-- 兑换数量弹窗：点卡片上的「兑换」才弹出，填完数量再提交，避免误触一换就是多份。 -->
  <Teleport to="body">
    <div v-if="exchangeTarget" class="exchange-mask" @click.self="closeExchange">
      <section class="exchange-dialog" role="dialog" aria-label="填写兑换数量">
        <header class="exchange-head">
          <div class="exchange-title">
            <img v-if="exchangeTarget.image" :src="exchangeTarget.image" :alt="goodsTitle(exchangeTarget)">
            <div>
              <strong>{{ goodsTitle(exchangeTarget) }}</strong>
              <span>{{ formatPrice(exchangeTarget.price) }} 福气币 / 个 · 限购 {{ exchangeTarget.remaining }}/{{ exchangeTarget.limit }}</span>
            </div>
          </div>
          <button type="button" class="exchange-close" aria-label="关闭" @click="closeExchange">×</button>
        </header>

        <div class="exchange-qty">
          <label for="yshf-exchange-qty">兑换数量</label>
          <div class="exchange-stepper">
            <button type="button" :disabled="exchangeQty <= 1" aria-label="减少数量" @click="stepExchange(-1)">−</button>
            <input
              id="yshf-exchange-qty"
              v-model.number="exchangeQty"
              type="number"
              min="1"
              :max="exchangeMax"
              inputmode="numeric"
            >
            <button type="button" :disabled="exchangeQty >= exchangeMax" aria-label="增加数量" @click="stepExchange(1)">+</button>
            <button type="button" class="exchange-all" :disabled="exchangeMax <= 1" @click="exchangeQty = exchangeMax">
              全部
            </button>
          </div>
          <p class="exchange-hint">
            最多可兑 {{ exchangeMax }} 个（受剩余限购与福气币余额限制）
          </p>
        </div>

        <div class="exchange-summary">
          <span>合计</span>
          <strong>{{ formatNumber(exchangeCost) }} 福气币</strong>
          <em>兑换后余额 {{ formatNumber(exchangeBalance) }}</em>
        </div>

        <footer class="exchange-actions">
          <button type="button" class="ghost" @click="closeExchange">取消</button>
          <button
            type="button"
            class="primary"
            :disabled="busy || exchangeQty < 1 || exchangeCost > luckCoin"
            @click="confirmExchange"
          >
            {{ busy ? '兑换中…' : `确认兑换 ${exchangeQty} 个` }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 页面与弹窗都按主题色取值：浅色下与原来的暖白卡片一致，深色下自动退回深灰底，
   不再固定 rgba(255,255,255,…) 导致深色模式整页发亮。弹窗通过 Teleport 挂到 body，
   不在 .yshf-page 内，所以两组选择器都要声明同一套变量。 */
.yshf-page,
.exchange-dialog {
  --yshf-panel-bg: color-mix(in srgb, var(--ui-surface-solid) 72%, transparent);
  --yshf-card-bg: color-mix(in srgb, var(--ui-warning) 5%, var(--ui-surface-solid));
  --yshf-soft-bg: color-mix(in srgb, var(--ui-ink) 5%, transparent);
  --yshf-chip-bg: color-mix(in srgb, var(--ui-warning) 12%, transparent);
}

.yshf-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.yshf-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 4px 2px 0;
}

.yshf-kicker {
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--ui-muted);
}

.yshf-hero h1 {
  margin: 6px 0 4px;
  font-size: 22px;
  color: var(--ui-ink);
}

.yshf-hero p {
  margin: 0;
  font-size: 13px;
  color: var(--ui-muted);
}

/* 资源条：三份资源横排成胶囊，数值在前、名称在后，提示语独占下一行。
   之前模板换成了 .yshf-wallet-bar 但样式还留在 .hero-wallet 上，
   于是每个 .wallet-item 各自占满一行，看起来是竖排三行。 */
.yshf-wallet-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.wallet-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 8px;
  border-radius: 999px;
  background: var(--yshf-panel-bg);
  border: 1px solid color-mix(in srgb, var(--ui-warning) 20%, var(--ui-border));
}

.wallet-item img {
  width: 26px;
  height: 26px;
  object-fit: contain;
}

.wallet-item b {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  color: var(--ui-ink);
  font-variant-numeric: tabular-nums;
}

.wallet-item span {
  font-size: 11px;
  line-height: 1;
  color: var(--ui-muted);
}

.wallet-error,
.wallet-stale,
.wallet-tagline {
  flex-basis: 100%;
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
}

.wallet-error {
  max-width: 520px;
  color: var(--ui-danger);
}

.wallet-stale {
  color: var(--ui-warning);
}

.wallet-tagline {
  color: var(--ui-muted);
}

.yshf-tabs {
  display: flex;
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: var(--yshf-soft-bg);
  width: fit-content;
}

.yshf-tabs button {
  padding: 7px 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-muted);
  font-size: 13px;
  cursor: pointer;
}

.yshf-tabs button.active {
  background: var(--ui-surface-solid);
  color: var(--ui-warning);
  box-shadow: var(--ui-shadow-sm);
}

.yshf-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

@media (min-width: 900px) {
  .yshf-columns {
    grid-template-columns: minmax(0, 1fr) 300px;
    align-items: start;
  }
}

.yshf-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.yshf-panel {
  padding: 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-card, 16px);
  background: var(--yshf-panel-bg);
  box-shadow: var(--ui-shadow-sm);
}

.price-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--ui-muted);
}

.price-head em {
  font-style: normal;
  font-size: 12px;
  color: var(--yshf-accent-soft);
}

.price-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0 10px;
  flex-wrap: wrap;
}

.price-main strong {
  font-size: 40px;
  line-height: 1;
  color: var(--yshf-accent);
  font-variant-numeric: tabular-nums;
}

.price-main span {
  font-size: 13px;
  color: var(--ui-muted);
}

.price-main i {
  font-style: normal;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 12px;
}

.price-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.price-tags span {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--yshf-soft-bg);
  font-size: 11px;
  color: var(--ui-muted);
}

.price-hint,
.commission-text,
.compare-hint,
.compare-note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-muted);
}

/* 提成领取按钮：与兑换按钮同一套暖色，可领时实心、不可领时描边。 */
.commission-claim {
  flex: none;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-warning) 55%, transparent);
  background: var(--ui-surface-solid);
  color: var(--ui-warning);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.commission-claim:not(:disabled) {
  background: linear-gradient(180deg, #ffb055, #f08a28);
  border-color: #f08a28;
  color: #fff;
}

.commission-claim:disabled {
  cursor: not-allowed;
  color: var(--ui-subtle);
  border-color: var(--ui-border);
  background: var(--ui-bg-soft);
}

.record-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 8px;
  font-size: 12px;
  color: var(--ui-muted);
}

.record-head span {
  font-weight: 600;
  color: var(--ui-ink);
}

.record-head em {
  font-style: normal;
  font-size: 11px;
}

.record-refresh {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-solid);
  color: var(--ui-muted);
  font-size: 11px;
  cursor: pointer;
}

.record-refresh:disabled {
  cursor: default;
  opacity: 0.6;
}

.record-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.record-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--yshf-card-bg);
  border: 1px solid var(--ui-border);
}

.record-list img {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex: none;
  object-fit: cover;
  background: var(--ui-bg-soft);
}

.record-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.record-main strong {
  font-size: 13px;
  color: var(--ui-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-main span {
  font-size: 11px;
  color: var(--ui-muted);
}

.record-side {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: none;
}

.record-side b {
  font-size: 14px;
  color: var(--yshf-accent);
  font-variant-numeric: tabular-nums;
}

.record-side em {
  font-style: normal;
  font-size: 11px;
  color: var(--ui-subtle);
}

.record-empty {
  margin: 10px 0 0;
  padding: 16px;
  border-radius: 12px;
  background: var(--yshf-card-bg);
  border: 1px dashed var(--ui-border);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-muted);
  text-align: center;
}

.quota-head,
.quota-foot,
.sell-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--ui-muted);
}

.quota-head em {
  font-style: normal;
  color: var(--ui-ink);
  font-variant-numeric: tabular-nums;
}

.quota-head em.soft {
  color: var(--ui-muted);
}

.quota-bar {
  height: 8px;
  margin: 10px 0 8px;
  border-radius: 999px;
  background: var(--yshf-soft-bg);
  overflow: hidden;
}

.quota-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #8fc95f, #4f9d2c);
  transition: width 0.3s;
}

.quota-foot .soft {
  font-size: 11px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.section-heading span {
  font-size: 12px;
  color: var(--ui-muted);
}

.section-heading strong {
  margin-left: 8px;
  font-size: 14px;
  color: var(--ui-ink);
}

.section-heading strong.muted {
  color: var(--ui-muted);
}

.section-heading .soft,
.soft {
  font-style: normal;
  font-size: 11px;
  color: var(--ui-muted);
}

.daily-note {
  margin: 6px 0 0;
  color: var(--ui-muted);
  font-size: 11px;
  line-height: 1.5;
}

.daily-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.yshf-button {
  flex: 1;
  min-width: 140px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.yshf-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.yshf-button.primary {
  background: linear-gradient(135deg, #f6a02c, #e2691f);
  color: #fff;
}

.yshf-button.ghost {
  background: var(--yshf-chip-bg);
  border-color: color-mix(in srgb, var(--ui-warning) 45%, transparent);
  color: var(--ui-warning);
}

.yshf-button.compact {
  flex: none;
  min-width: 0;
  padding: 6px 14px;
  font-size: 12px;
}

.yshf-button.wide {
  width: 100%;
  margin-top: 10px;
}

.sell-panel .sell-row {
  padding: 6px 0;
  border-bottom: 1px dashed var(--ui-border);
}

.sell-row strong {
  color: var(--ui-ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.sell-row.total strong {
  color: var(--yshf-accent);
  font-size: 16px;
}

.sell-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  font-size: 12px;
  color: var(--ui-muted);
}

.sell-input input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface-solid);
  font-size: 13px;
  color: var(--ui-ink);
}

.sell-warning {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--yshf-accent-soft);
}

/* 手填 GID 的行情回执：默认弱提示，明确不能卖（can_sell=false）时才转成告警色。 */
.sell-hint {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-muted);
}

.sell-hint.warning {
  color: var(--yshf-accent-soft);
}

/* 已经带上对方今日标识时的折叠态：一行弱提示 + 「换一个」，
   不再常驻一个空输入框占位置。 */
.share-key-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--yshf-chip-bg);
  font-size: 11px;
  color: var(--ui-muted);
}

/* 分享标识（UUID）本身：等宽字体 + 弱色，一眼能看出是凭据而不是备注。 */
.share-key-text {
  font-family: var(--ui-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-style: normal;
  color: var(--ui-muted);
  opacity: 0.85;
  cursor: help;
}

/* 比价页的手动添加入口。 */
.compare-add {
  margin: 8px 0 4px;
}

.compare-add__form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.compare-add__form input {
  flex: 1 1 140px;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface-solid);
  font-size: 12px;
  color: var(--ui-ink);
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--ui-warning);
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}

.catalog-card {
  padding: 10px 8px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--yshf-card-bg);
  text-align: center;
}

.catalog-thumb {
  height: 56px;
  display: grid;
  place-items: center;
}

.catalog-thumb img {
  width: 52px;
  height: 52px;
  object-fit: contain;
}

.catalog-placeholder {
  font-size: 12px;
  color: var(--ui-muted);
}

.catalog-name {
  margin: 6px 0 2px;
  font-size: 12px;
  color: var(--ui-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-limit {
  margin: 0;
  font-size: 11px;
  color: var(--ui-muted);
}

.catalog-price {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--yshf-accent);
}

.catalog-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-top: 6px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
}

.catalog-stepper button {
  width: 30px;
  padding: 3px 0;
  border: 0;
  background: var(--yshf-soft-bg);
  color: var(--ui-muted);
  font-size: 14px;
  line-height: 1.2;
  cursor: pointer;
}

.catalog-stepper button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.catalog-stepper span {
  flex: 1;
  padding: 3px 0;
  color: var(--ui-ink);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.catalog-cost {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--ui-muted);
}

.catalog-buy {
  margin-top: 6px;
  width: 100%;
  padding: 5px 0;
  border: 1px solid color-mix(in srgb, var(--ui-warning) 45%, transparent);
  border-radius: 999px;
  background: var(--yshf-chip-bg);
  color: var(--ui-warning);
  font-size: 12px;
  cursor: pointer;
}

.catalog-buy.narrow {
  width: auto;
  min-width: 64px;
  margin-top: 0;
  padding: 6px 12px;
}

.catalog-buy:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.catalog-empty {
  margin: 0;
  font-size: 12px;
  color: var(--ui-muted);
}

.compare-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.compare-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--yshf-card-bg);
}

.rank {
  width: 20px;
  font-size: 12px;
  color: var(--ui-muted);
  text-align: center;
}

.compare-row .who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.compare-row .who strong {
  font-size: 13px;
  color: var(--ui-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compare-row .who em {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 10px;
  font-style: normal;
}

.compare-row .who em.panel-source {
  background: var(--ui-blue-soft);
  color: var(--ui-blue);
}

.compare-row .who span {
  font-size: 11px;
  color: var(--ui-muted);
}

.compare-row .quote {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 72px;
}

.compare-row .quote strong {
  font-size: 16px;
  color: var(--yshf-accent);
  font-variant-numeric: tabular-nums;
}

.compare-row .quote span {
  font-size: 11px;
  color: var(--ui-muted);
}

.compare-row .quote span.closed {
  padding: 0 5px;
  border-radius: 999px;
  font-weight: 600;
  color: var(--ui-danger);
  background: var(--ui-danger-soft);
}

.rules-line {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-muted);
}

/* 兑换数量弹窗 */
.exchange-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(32, 22, 12, 0.42);
  backdrop-filter: blur(2px);
}

.exchange-dialog {
  width: min(420px, 100%);
  padding: 18px 20px 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--ui-warning) 4%, var(--ui-surface-solid));
  box-shadow: var(--ui-shadow-lg);
  border: 1px solid var(--ui-border);
}

.exchange-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.exchange-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.exchange-title img {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 12px;
  object-fit: contain;
  background: var(--ui-bg-soft);
}

.exchange-title div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.exchange-title strong {
  font-size: 15px;
  color: var(--ui-ink);
}

.exchange-title span {
  font-size: 11px;
  color: var(--ui-muted);
}

.exchange-close {
  flex: none;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: var(--ui-bg-soft);
  color: var(--ui-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.exchange-qty {
  margin-top: 16px;
}

.exchange-qty > label {
  font-size: 12px;
  color: var(--ui-muted);
}

.exchange-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.exchange-stepper button {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-solid);
  color: var(--ui-warning);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.exchange-stepper button:disabled {
  color: var(--ui-subtle);
  cursor: not-allowed;
}

.exchange-stepper input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-solid);
  color: var(--ui-ink);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.exchange-stepper input:focus {
  outline: 2px solid var(--ui-warning);
  outline-offset: 1px;
}

.exchange-stepper .exchange-all {
  width: auto;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
}

.exchange-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--ui-muted);
}

.exchange-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--yshf-chip-bg);
  border: 1px solid var(--ui-border);
}

.exchange-summary span {
  font-size: 12px;
  color: var(--ui-muted);
}

.exchange-summary strong {
  font-size: 18px;
  color: var(--yshf-accent);
  font-variant-numeric: tabular-nums;
}

.exchange-summary em {
  margin-left: auto;
  font-style: normal;
  font-size: 11px;
  color: var(--ui-subtle);
}

.exchange-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.exchange-actions button {
  flex: 1;
  height: 38px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.exchange-actions .ghost {
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-solid);
  color: var(--ui-muted);
}

.exchange-actions .primary {
  border: 1px solid #f08a28;
  background: linear-gradient(180deg, #ffb055, #f08a28);
  color: #fff;
}

.exchange-actions .primary:disabled {
  border-color: var(--ui-border);
  background: var(--ui-bg-soft);
  color: var(--ui-subtle);
  cursor: not-allowed;
}
</style>
