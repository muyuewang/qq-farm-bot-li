<script setup lang="ts">
import type { MallGoodsDto } from '@/stores/commerce'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CommerceItemImage from '@/components/commerce/CommerceItemImage.vue'
import PurchaseDialog from '@/components/commerce/PurchaseDialog.vue'
import { useAccountStore } from '@/stores/account'
import { useCommerceStore } from '@/stores/commerce'
import { useToastStore } from '@/stores/toast'

type FilterKey = 'all' | 'free' | 'discount' | 'fertilizer' | 'pet' | 'activity'

const accountStore = useAccountStore()
const commerceStore = useCommerceStore()
const toast = useToastStore()
const route = useRoute()
const { currentAccountId } = storeToRefs(accountStore)
const { mall, mallLoading, purchasingGoodsId, error, notice } = storeToRefs(commerceStore)
const selected = ref<MallGoodsDto | null>(null)
const filter = ref<FilterKey>(route.query.category === 'pet-diary' ? 'activity' : 'all')
const query = ref('')
const clock = ref(Date.now())
let timer: number | undefined

const filters: Array<{ key: FilterKey, label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'free', label: '免费' },
  { key: 'discount', label: '折扣' },
  { key: 'fertilizer', label: '化肥' },
  { key: 'pet', label: '狗粮' },
  { key: 'activity', label: '萌宠成长日记' },
]

const filteredGoods = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return (mall.value?.goods || []).filter((goods) => {
    const names = [goods.name, ...goods.rewards.map(item => item.name)].join(' ').toLowerCase()
    if (keyword && !names.includes(keyword) && !String(goods.id).includes(keyword))
      return false
    if (filter.value === 'free')
      return goods.isFree
    if (filter.value === 'discount')
      return goods.isDiscounted || !!goods.discountText
    if (filter.value === 'fertilizer')
      return names.includes('化肥')
    if (filter.value === 'pet')
      return names.includes('狗粮')
    if (filter.value === 'activity')
      return goods.rewards.some(item => [1028, 1029, 1030, 80101, 80102, 80103, 90031, 90032, 90033, 90034, 90041, 29004, 101305].includes(Number(item.id)))
    return true
  })
})

const refreshRemaining = computed(() => {
  if (!mall.value)
    return ''
  const refreshAt = mall.value.serverTime + mall.value.refreshCountdown * 1000
  const seconds = Math.max(0, Math.floor((refreshAt - clock.value) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}小时${minutes}分钟后刷新`
})

function load() {
  commerceStore.fetchMall(String(currentAccountId.value || ''))
}

function choose(goods: MallGoodsDto) {
  if (goods.purchasable)
    selected.value = goods
}

async function purchase(count: number) {
  if (!selected.value)
    return
  const goods = selected.value
  const succeeded = await commerceStore.purchaseMall(String(currentAccountId.value || ''), goods, count)
  if (succeeded) {
    toast.success(`购买成功：${goods.name} x${count}`)
    selected.value = null
  }
  else {
    toast.error(error.value || `购买失败：${goods.name}`)
  }
}

watch(currentAccountId, () => {
  selected.value = null
  load()
})
watch(mall, () => {
  if (selected.value)
    selected.value = mall.value?.goods.find(goods => goods.id === selected.value?.id) || null
})
onMounted(() => {
  load()
  timer = window.setInterval(() => clock.value = Date.now(), 1000)
})
onUnmounted(() => {
  if (timer)
    window.clearInterval(timer)
})
</script>

<template>
  <div class="mall-page">
    <header class="mall-header">
      <div>
        <p>QQ 农场</p>
        <h1>游戏商城</h1>
        <span v-if="mall">{{ refreshRemaining }}</span>
      </div>
      <div class="mall-header__actions">
        <div v-for="currency in mall?.currencies || []" :key="currency.id" class="currency-balance">
          <CommerceItemImage :src="currency.image" :alt="currency.name" size="sm" />
          <span>{{ currency.name }}</span>
          <strong>{{ currency.balanceKnown ? currency.count.toLocaleString() : '--' }}</strong>
        </div>
        <button type="button" title="刷新商城" :disabled="mallLoading" @click="load">
          <div class="i-carbon-renew" :class="{ 'animate-spin': mallLoading }" />
        </button>
      </div>
    </header>

    <div v-if="error || notice" class="mall-message" :class="{ success: !!notice && !error }">
      <span>{{ error || notice }}</span>
      <button type="button" title="关闭消息" @click="commerceStore.clearMessages">
        <div class="i-carbon-close" />
      </button>
    </div>

    <section class="mall-toolbar" aria-label="商品筛选">
      <div class="filter-tabs">
        <button v-for="entry in filters" :key="entry.key" type="button" :class="{ active: filter === entry.key }" @click="filter = entry.key">
          {{ entry.label }}
        </button>
      </div>
      <label class="mall-search">
        <div class="i-carbon-search" />
        <input v-model="query" type="search" placeholder="搜索商品">
      </label>
    </section>

    <div v-if="!currentAccountId" class="mall-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
    </div>
    <div v-else-if="mallLoading && !mall" class="mall-state">
      <div class="i-carbon-circle-dash animate-spin" />
      <strong>正在加载商城</strong>
    </div>
    <div v-else-if="!mall && error" class="mall-state">
      <div class="i-carbon-warning-alt" />
      <strong>{{ error }}</strong>
      <button type="button" @click="load">
        重试
      </button>
    </div>
    <div v-else-if="filteredGoods.length === 0" class="mall-state">
      <div class="i-carbon-search-locate" />
      <strong>没有匹配的商品</strong>
    </div>

    <section v-else class="goods-grid" aria-live="polite">
      <article v-for="goods in filteredGoods" :key="goods.id" class="goods-card" :class="{ unavailable: !goods.purchasable }">
        <div class="goods-visual">
          <CommerceItemImage :src="goods.rewards[0]?.image" :alt="goods.rewards[0]?.name || goods.name" size="lg" />
          <span v-if="goods.isFree" class="goods-badge free">免费</span>
          <span v-else-if="goods.discountText" class="goods-badge discount">{{ goods.discountText }}</span>
        </div>
        <div class="goods-main">
          <div class="goods-title">
            <h2>{{ goods.name }}</h2>
            <small>#{{ goods.id }}</small>
          </div>
          <div class="reward-list">
            <span v-for="reward in goods.rewards" :key="reward.id">
              <CommerceItemImage :src="reward.image" :alt="reward.name" size="sm" />
              {{ reward.name }} x{{ reward.count }}
            </span>
          </div>
          <div v-if="goods.limit" class="limit-row">
            <span>限购 {{ goods.limit.bought }}/{{ goods.limit.max }}</span>
            <div><i :style="{ width: `${Math.min(100, goods.limit.max ? goods.limit.bought / goods.limit.max * 100 : 0)}%` }" /></div>
          </div>
        </div>
        <footer>
          <div class="goods-price">
            <strong v-if="goods.isFree">免费</strong>
            <template v-else>
              <CommerceItemImage :src="goods.price.image" :alt="goods.price.name" size="sm" />
              <strong>{{ goods.price.count.toLocaleString() }}</strong>
            </template>
          </div>
          <button type="button" :disabled="!goods.purchasable || purchasingGoodsId !== null" @click="choose(goods)">
            <div class="i-carbon-shopping-cart-plus" />
            {{ goods.purchasable ? '购买' : '已售罄' }}
          </button>
        </footer>
      </article>
    </section>

    <PurchaseDialog
      :open="!!selected"
      :goods="selected"
      :pending="purchasingGoodsId === selected?.id"
      @close="selected = null"
      @confirm="purchase"
    />
  </div>
</template>

<style scoped>
.mall-page {
  min-height: 100%;
  color: var(--ui-ink);
}
.mall-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 4px 2px 20px;
  border-bottom: 1px solid var(--ui-border);
}
.mall-header p {
  margin: 0 0 4px;
  color: var(--ui-primary);
  font-size: 12px;
  font-weight: 600;
}
.mall-header h1 {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
}
.mall-header > div > span {
  display: block;
  margin-top: 5px;
  color: var(--ui-muted);
  font-size: 12px;
}
.mall-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.mall-header__actions > button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  color: var(--ui-primary);
  background: var(--ui-surface);
  cursor: pointer;
}
.currency-balance {
  display: grid;
  grid-template-columns: 30px auto auto;
  gap: 6px;
  align-items: center;
  padding: 3px 9px 3px 3px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface);
}
.currency-balance span {
  color: var(--ui-muted);
  font-size: 11px;
}
.currency-balance strong {
  color: var(--ui-ink);
  font-size: 13px;
}
.mall-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(201, 95, 102, 0.2);
  border-radius: 8px;
  color: #9a4048;
  background: var(--ui-danger-soft);
  font-size: 13px;
}
.mall-message.success {
  border-color: rgba(67, 141, 99, 0.2);
  color: #2e714b;
  background: var(--ui-primary-soft);
}
.mall-message button {
  display: grid;
  place-items: center;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.mall-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 0;
}
.filter-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.filter-tabs button {
  height: 34px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--ui-muted);
  background: transparent;
  white-space: nowrap;
  cursor: pointer;
}
.filter-tabs button:hover {
  background: var(--ui-surface-soft);
}
.filter-tabs button.active {
  border-color: rgba(67, 141, 99, 0.17);
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
  font-weight: 700;
}
.mall-search {
  display: flex;
  width: min(270px, 38vw);
  height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  color: var(--ui-muted);
  background: var(--ui-surface);
}
.mall-search:focus-within {
  border-color: rgba(67, 141, 99, 0.5);
  box-shadow: 0 0 0 3px rgba(67, 141, 99, 0.1);
}
.mall-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--ui-ink);
  background: transparent;
}
.goods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(218px, 1fr));
  gap: 12px;
  padding-bottom: 24px;
}
.goods-card {
  display: flex;
  min-height: 290px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-card);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.goods-card:hover {
  border-color: rgba(67, 141, 99, 0.28);
  box-shadow: var(--ui-shadow-md);
  transform: translateY(-1px);
}
.goods-card.unavailable {
  opacity: 0.62;
}
.goods-visual {
  position: relative;
  display: grid;
  min-height: 126px;
  place-items: center;
  border-bottom: 1px solid rgba(58, 86, 68, 0.08);
  background: var(--ui-surface-soft);
}
.goods-visual :deep(.item-image--lg) {
  width: 92px;
  height: 92px;
}
.goods-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  color: white;
  font-size: 10px;
  font-weight: 700;
}
.goods-badge.free {
  background: var(--ui-primary);
}
.goods-badge.discount {
  background: var(--ui-danger);
}
.goods-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 13px 14px;
}
.goods-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.goods-title h2 {
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.goods-title small,
.limit-row {
  color: var(--ui-subtle);
  font-size: 10px;
}
.reward-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}
.reward-list > span {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--ui-muted);
  font-size: 12px;
}
.reward-list > span :deep(.item-image--sm),
.goods-price :deep(.item-image--sm) {
  width: 24px;
  height: 24px;
}
.limit-row {
  margin-top: auto;
  padding-top: 10px;
}
.limit-row > div {
  height: 4px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8ede7;
}
.limit-row i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-warning);
}
.goods-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid rgba(58, 86, 68, 0.09);
}
.goods-price {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-warning);
  font-size: 13px;
}
.goods-card footer > button {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--ui-primary);
  border-radius: 9px;
  color: white;
  background: var(--ui-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.goods-card footer > button:disabled {
  border-color: #bdc4be;
  color: #f5f7f4;
  background: #bdc4be;
  cursor: not-allowed;
}
.mall-state {
  display: flex;
  min-height: 340px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 11px;
  color: var(--ui-muted);
  text-align: center;
}
.mall-state > div {
  color: var(--ui-primary);
  font-size: 34px;
}
.mall-state button {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--ui-primary);
  border-radius: 9px;
  color: white;
  background: var(--ui-primary);
  cursor: pointer;
}
@media (max-width: 720px) {
  .mall-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .mall-header__actions {
    width: 100%;
    justify-content: flex-start;
  }
  .mall-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .mall-search {
    width: 100%;
  }
  .goods-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .goods-card {
    min-height: 252px;
  }
  .goods-visual {
    min-height: 94px;
  }
  .goods-visual :deep(.item-image--lg) {
    width: 66px;
    height: 66px;
  }
  .goods-main {
    padding: 9px;
  }
  .goods-card footer {
    gap: 6px;
    padding: 8px 9px;
  }
  .goods-card footer > button {
    height: 31px;
    padding: 0 8px;
    font-size: 11px;
  }
  .goods-price {
    font-size: 11px;
  }
}
</style>
