<script setup lang="ts">
import { NButton } from 'naive-ui/es/button'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { YishuHuanfuTab } from '@/components/activity/gameplays/yishuhuanfu'
import { useAccountStore } from '@/stores/account'
import { useActivityCenterStore, type YishuHuanfuFriendShopDto } from '@/stores/activity-center'
import { useActivityClock } from './useActivityClock'

const emit = defineEmits<{ back: [] }>()
const accountStore = useAccountStore()
const activityStore = useActivityCenterStore()
const { currentAccountId } = storeToRefs(accountStore)
const {
  yishuHuanfu,
  loading,
  error,
  actionError,
  notice,
  pendingActions,
  yishuHuanfuFriendShops,
  yishuHuanfuFriendShopsLoading,
  yishuHuanfuFriendScanAt,
  yishuHuanfuFriendScanNote,
  yishuHuanfuRecords,
  yishuHuanfuRecordsLoading,
  yishuHuanfuRecordsNote,
} = storeToRefs(activityStore)
const { remaining } = useActivityClock()
const remainingText = remaining(computed(() => yishuHuanfu.value?.endTime))

const numberFormatter = new Intl.NumberFormat('zh-CN')
function formatNumber(value: string | number | null | undefined) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? numberFormatter.format(num) : String(value ?? '0')
}

// 「剩余：14天10小时」→「14 天 10 小时」，与牧歌初启页头同一写法。
const headMeta = computed(() => {
  const raw = String(remainingText.value || '').trim()
  if (!raw || raw === '活动已结束')
    return raw
  return raw.replace(/^剩余[：:]\s*/, '').replace(/(\d+)\s*(天|小时|分钟)/g, '$1 $2 ').trim()
})

function accountId() {
  return String(currentAccountId.value || '')
}
async function refreshActivity() {
  const ok = await activityStore.loadDetails(accountId(), 'yishuhuanfu')
  // 兑换档位的价格与剩余次数会随当日行情变，刷新时一并重拉 cmd 97，
  // 否则「已加载过」的旧目录会一直挂在界面上。
  activityStore.loadYishuHuanfuCatalog(accountId())
  // 收购记录同样不进快照，页头刷新要一起更新，不能只刷余额和行情。
  loadRecords(true)
  return ok
}

// 兑换目录（cmd 97）和本人铺子额度（cmd 92）都不在快照里，进页面各拉一次。
function loadCatalog() {
  const id = accountId()
  if (!id || !yishuHuanfu.value || yishuHuanfu.value.catalogLoaded)
    return
  activityStore.loadYishuHuanfuCatalog(id)
}

function loadShopQuota() {
  const id = accountId()
  if (!id || !yishuHuanfu.value || yishuHuanfu.value.shop.quota !== null)
    return
  activityStore.loadYishuHuanfuShop(id)
}

// 账号切换、或详情首次到位时补一次；已有值时不重复请求。
watch(
  () => [currentAccountId.value, yishuHuanfu.value?.activityId, yishuHuanfu.value?.catalogLoaded, yishuHuanfu.value?.shop.quota],
  () => {
    loadCatalog()
    loadShopQuota()
  },
  { immediate: true },
)

// 活动详情到位后再拉收购记录，避免账号还没切好就发请求。
// 换账号或重新进入页面都必须真拉一次：记录按账号隔离，store 在换号时已清空，
// 这里再用 force 跳过「已加载」守卫，否则会沿用上一个账号的列表。
let recordsAccountId = ''
watch(
  () => [currentAccountId.value, yishuHuanfu.value?.activityId],
  () => {
    const id = accountId()
    if (!id)
      return
    const switched = id !== recordsAccountId
    recordsAccountId = id
    loadRecords(switched)
  },
  { immediate: true },
)

// 手动指定 GID 卖薯：蜜薯不只能卖给好友，陌生人（只要开着铺子）也收。
// 行情单独用 cmd 92 查一次，界面按查到的单价与剩余额度预估，成交仍由后端校验后落地。
const manualQuote = ref<YishuHuanfuFriendShopDto | null>(null)
const manualQuoteLoading = ref(false)
const manualQuoteNote = ref('')
// 回执属于哪个 GID：手改输入框后旧提示必须消失，否则会把上一个号码的单价/额度当成本次的。
const manualQuoteGid = ref('')

// 换账号必须清掉：上一个账号查的 GID 行情留着会误导「单价 / 额度」。
watch(currentAccountId, () => {
  manualQuote.value = null
  manualQuoteNote.value = ''
  manualQuoteGid.value = ''
})

async function onQueryShop(gid: string) {
  const id = accountId()
  const target = String(gid || '').trim()
  if (!id)
    return
  if (!target) {
    manualQuote.value = null
    manualQuoteNote.value = '先填写对方 GID'
    return
  }
  manualQuoteLoading.value = true
  manualQuoteNote.value = ''
  manualQuoteGid.value = target
  try {
    const quote = await activityStore.queryYishuHuanfuShopQuote(id, target)
    manualQuote.value = quote
    if (!quote)
      manualQuoteNote.value = '没查到这个 GID 的铺子，确认号码是否正确'
    else if (quote.canSell === false)
      manualQuoteNote.value = '这家铺子当前不收蜜薯'
    else
      manualQuoteNote.value = `今日收购价 ${formatNumber(quote.totalPrice)} 福气币 / 个，剩余额度 ${formatNumber(quote.quota)} 个`
  }
  catch (e: any) {
    manualQuote.value = null
    manualQuoteNote.value = String(e?.message || '查询失败，稍后再试')
  }
  finally {
    manualQuoteLoading.value = false
  }
}

async function onSell(payload: { friendGid: string, count: number | null }) {  const id = accountId()
  if (!id)
    return
  const ok = await activityStore.sellYishuHuanfuSweetPotato(id, payload.friendGid, payload.count)
  // 卖完额度和比价都会变，顺手刷一遍；失败时也刷，避免额度显示落后。
  if (ok)
    activityStore.loadYishuHuanfuShop(id)
  if (ok && payload.friendGid)
    activityStore.scanYishuHuanfuFriendShops(id, true)
  // 手动指定 GID 卖出后，这家铺子的剩余额度已经变了，重新查一次才不会再被提示「超出额度」。
  if (ok && payload.friendGid && manualQuote.value?.gid === payload.friendGid)
    await onQueryShop(payload.friendGid)
}

// 收购记录（cmd 95）不进快照，进页面拉一次；领完提成、卖完薯都重新拉，保持列表最新。
// 「是否已加载过」的判断交给 store（按账号记账），这里不再用列表长度当守卫——
// 那会把上一个账号残留的记录当成「已加载」，切号后一直显示别人的数据。
function loadRecords(force = false) {
  const id = accountId()
  if (!id)
    return
  activityStore.loadYishuHuanfuRecords(id, force)
}

async function onClaimCommission() {
  const id = accountId()
  if (!id)
    return
  const ok = await activityStore.claimYishuHuanfuCommission(id)
  if (ok)
    loadRecords(true)
}
</script>

<template>
  <section class="yshf-view">
    <!-- 页头与牧歌初启一致：直接铺在内容区上，不套活动外框。 -->
    <header class="yshf-view__head">
      <div class="yshf-view__lead">
        <NButton quaternary circle title="返回活动列表" aria-label="返回活动列表" @click="emit('back')">
          <template #icon>
            <span class="i-carbon-arrow-left" />
          </template>
        </NButton>
        <!-- 与活动列表卡片共用同一张图标，避免两处图形不一样。 -->
        <img
          src="/activity-assets/yishuhuanfu/icon.png"
          alt=""
          width="32"
          height="32"
          class="yshf-view__icon"
        >
        <div class="yshf-view__text">
          <h1>{{ yishuHuanfu?.name || '以薯换福' }}</h1>
          <p v-if="headMeta">
            <span class="i-carbon-time" aria-hidden="true" />{{ headMeta }}
          </p>
        </div>
      </div>
      <div class="yshf-view__actions">
        <div class="yshf-view__balance" title="福气币">
          <img v-if="yishuHuanfu?.luckCoin.image" :src="yishuHuanfu.luckCoin.image" alt="">
          <b>{{ yishuHuanfu?.luckCoinBalanceKnown ? formatNumber(yishuHuanfu.luckCoinBalance || '0') : '--' }}</b>
        </div>
        <NButton quaternary circle :loading="loading" title="刷新活动数据" aria-label="刷新活动数据" @click="refreshActivity">
          <template #icon>
            <span class="i-carbon-renew" />
          </template>
        </NButton>
      </div>
    </header>

    <div v-if="!currentAccountId" class="yshf-view__state">
      <strong>请先选择账号</strong><span>活动数据按当前账号加载</span>
    </div>
    <div v-else-if="loading && !yishuHuanfu" class="yshf-view__state">
      <span class="yshf-view__spinner" /><strong>正在加载以薯换福</strong>
    </div>
    <template v-else>
      <div
        v-if="error || actionError || notice"
        class="yshf-view__message"
        :class="{ success: notice && !error && !actionError }"
        role="status"
      >
        <span>{{ actionError || error || notice }}</span>
        <button v-if="error" type="button" :disabled="loading" @click="refreshActivity">
          重试
        </button>
      </div>
      <YishuHuanfuTab
        :activity="yishuHuanfu"
        :pending-seed="pendingActions.claimYishuHuanfuSeed"
        :pending-sell="pendingActions.sellYishuHuanfuSweetPotato"
        :pending-share="pendingActions.shareYishuHuanfuShop"
        :pending-exchange="pendingActions.exchangeYishuHuanfuGoods"
        :pending-quote="pendingActions.refreshYishuHuanfuQuote"
        :pending-commission="pendingActions.claimYishuHuanfuCommission"
        :friend-shops="yishuHuanfuFriendShops"
        :friend-shops-loading="yishuHuanfuFriendShopsLoading"
        :friend-scan-at="yishuHuanfuFriendScanAt"
        :friend-scan-note="yishuHuanfuFriendScanNote"
        :records="yishuHuanfuRecords"
        :records-loading="yishuHuanfuRecordsLoading"
        :records-note="yishuHuanfuRecordsNote"
        :target-quote="manualQuote"
        :target-quote-loading="manualQuoteLoading"
        :target-quote-note="manualQuoteNote"
        :target-quote-gid="manualQuoteGid"
        @claim-seed="activityStore.claimYishuHuanfuSeeds(accountId())"
        @sell="onSell"
        @query-shop="onQueryShop"
        @share="activityStore.shareYishuHuanfuShop(accountId())"
        @exchange="(index, count) => activityStore.exchangeYishuHuanfuGoods(accountId(), index, count)"
        @scan-friends="(force) => activityStore.scanYishuHuanfuFriendShops(accountId(), force)"
        @refresh-shop="loadShopQuota"
        @refresh-quote="activityStore.refreshYishuHuanfuQuote(accountId())"
        @claim-commission="onClaimCommission"
        @load-records="activityStore.loadYishuHuanfuRecords(accountId(), true)"
      />
    </template>
  </section>
</template>

<style scoped>
/* 页面直接铺在内容区上，与牧歌初启、游戏商城同一种结构：无外框、无阴影。 */
.yshf-view {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}

.yshf-view__head {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 16px;
}

.yshf-view__lead {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.yshf-view__icon {
  flex: none;
  object-fit: contain;
}

.yshf-view__text {
  min-width: 0;
}

.yshf-view h1 {
  margin: 0;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 22px;
  font-weight: var(--fw-700);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.yshf-view__text p {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 2px 0 0;
  color: var(--ui-muted);
  font-size: 12px;
  white-space: nowrap;
}

.yshf-view__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.yshf-view__balance {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px 0 5px;
  border-radius: 999px;
  color: var(--ui-warning, #b07a32);
  background: var(--ui-warning-soft, #fbf2e3);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.yshf-view__balance img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.yshf-view__state {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ui-muted);
}

.yshf-view__state strong {
  color: var(--ui-ink);
  font-size: 16px;
}

.yshf-view__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(67, 141, 99, 0.18);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: yshf-spin 0.85s linear infinite;
}

.yshf-view__message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-danger) 20%, transparent);
  border-radius: 10px;
  color: var(--ui-danger);
  background: color-mix(in srgb, var(--ui-danger-soft) 94%, transparent);
  font-size: 11px;
}

.yshf-view__message.success {
  border-color: color-mix(in srgb, var(--ui-primary) 20%, transparent);
  color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary-soft) 94%, transparent);
}

.yshf-view__message button {
  flex: none;
  padding: 3px 8px;
  border: 1px solid currentcolor;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

@keyframes yshf-spin {
  to { transform: rotate(360deg); }
}
</style>
