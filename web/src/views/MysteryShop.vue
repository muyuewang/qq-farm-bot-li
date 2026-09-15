<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CommerceItemImage from '@/components/commerce/CommerceItemImage.vue'
import { useAccountStore } from '@/stores/account'
import { useCommerceStore } from '@/stores/commerce'

const accountStore = useAccountStore()
const commerceStore = useCommerceStore()
const { currentAccountId } = storeToRefs(accountStore)
const { mystery, mysteryLoading, mysteryPurchasing, error, notice } = storeToRefs(commerceStore)
const clock = ref(Date.now())
const purchaseDialogOpen = ref(false)
let timer: number | undefined

const remaining = computed(() => {
  const end = mystery.value?.expireTime || 0
  const diff = Math.max(0, end - clock.value)
  if (!end || diff === 0)
    return '已离开'
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return `${hours}小时${minutes}分${seconds}秒`
})

const discountLabel = computed(() => {
  const percent = mystery.value?.npc?.discountPercent || 0
  return percent > 0 ? `${(percent / 10).toFixed(percent % 10 ? 1 : 0)}折` : ''
})

const canPurchase = computed(() => {
  const npc = mystery.value?.npc
  return !!npc && npc.reward.count > 0 && (npc.price.balance === null || npc.price.balance >= npc.price.count)
})

function load() {
  commerceStore.fetchMystery(String(currentAccountId.value || ''))
}

function purchase() {
  const npc = mystery.value?.npc
  if (!npc || !canPurchase.value || mysteryPurchasing.value)
    return
  purchaseDialogOpen.value = true
}

async function confirmPurchase() {
  const npc = mystery.value?.npc
  if (!npc || !canPurchase.value || mysteryPurchasing.value)
    return
  const succeeded = await commerceStore.purchaseMystery(String(currentAccountId.value || ''), npc.id)
  if (succeeded)
    purchaseDialogOpen.value = false
}

watch(currentAccountId, () => {
  purchaseDialogOpen.value = false
  load()
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
  <div class="mystery-page">
    <header class="mystery-header">
      <div>
        <p>限时来访</p>
        <h1>神秘商人</h1>
        <span v-if="mystery?.active">距离离开 {{ remaining }}</span>
      </div>
      <button type="button" title="刷新神秘商人" :disabled="mysteryLoading" @click="load">
        <div class="i-carbon-renew" :class="{ 'animate-spin': mysteryLoading }" />
      </button>
    </header>

    <div v-if="error || notice" class="mystery-message" :class="{ success: !!notice && !error }">
      {{ error || notice }}
    </div>

    <div v-if="!currentAccountId" class="mystery-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
    </div>
    <div v-else-if="mysteryLoading && !mystery" class="mystery-state">
      <div class="i-carbon-circle-dash animate-spin" />
      <strong>正在寻找神秘商人</strong>
    </div>
    <div v-else-if="error && !mystery" class="mystery-state">
      <div class="i-carbon-warning-alt" />
      <strong>{{ error }}</strong>
      <button type="button" @click="load">
        重试
      </button>
    </div>
    <div v-else-if="!mystery?.active || !mystery.npc" class="mystery-state">
      <div class="i-carbon-store" />
      <strong>神秘商人暂未出现</strong>
    </div>

    <main v-else class="merchant-scene">
      <section class="merchant-identity">
        <div class="merchant-mark">
          <div class="i-carbon-store" />
        </div>
        <div>
          <span>商人编号 #{{ mystery.npc.id }}</span>
          <h2>今日神秘货品</h2>
          <p>{{ new Date(mystery.activeTime || 0).toLocaleString() }} 开始营业</p>
        </div>
      </section>

      <article class="mystery-offer">
        <div class="offer-visual">
          <CommerceItemImage :src="mystery.npc.reward.image" :alt="mystery.npc.reward.name" size="lg" />
          <span v-if="discountLabel">{{ discountLabel }}</span>
        </div>
        <div class="offer-content">
          <small>神秘商品 #{{ mystery.npc.reward.id }}</small>
          <h2>{{ mystery.npc.reward.name }}</h2>
          <dl>
            <div><dt>商品数量</dt><dd>x{{ mystery.npc.reward.count }}</dd></div>
            <div>
              <dt>原价</dt><dd class="original">
                {{ mystery.npc.originalPrice.toLocaleString() }}
              </dd>
            </div>
          </dl>
          <div class="offer-price">
            <CommerceItemImage :src="mystery.npc.price.image" :alt="mystery.npc.price.name" size="sm" />
            <strong>{{ mystery.npc.price.count.toLocaleString() }}</strong>
            <span>余额 {{ mystery.npc.price.balance === null ? '--' : mystery.npc.price.balance.toLocaleString() }}</span>
          </div>
          <button class="purchase-button" type="button" :disabled="!canPurchase || mysteryPurchasing" @click="purchase">
            <div v-if="mysteryPurchasing" class="i-carbon-circle-dash animate-spin" />
            <div v-else class="i-carbon-shopping-cart-plus" />
            {{ mysteryPurchasing ? '购买中' : canPurchase ? '购买这批商品' : '暂不可购买' }}
          </button>
        </div>
      </article>
    </main>

    <Teleport to="body">
      <Transition name="merchant-dialog">
        <div v-if="purchaseDialogOpen && mystery?.npc" class="purchase-overlay" role="presentation" @click.self="!mysteryPurchasing && (purchaseDialogOpen = false)">
          <section class="purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="mystery-purchase-title">
            <button class="dialog-close" type="button" aria-label="关闭" :disabled="mysteryPurchasing" @click="purchaseDialogOpen = false">
              <div class="i-carbon-close" />
            </button>
            <span class="dialog-kicker">神秘商人交易确认</span>
            <h2 id="mystery-purchase-title">
              确认购买这批商品？
            </h2>
            <div class="dialog-goods">
              <CommerceItemImage :src="mystery.npc.reward.image" :alt="mystery.npc.reward.name" size="lg" />
              <div><strong>{{ mystery.npc.reward.name }}</strong><span>获得 x{{ mystery.npc.reward.count }}</span></div>
            </div>
            <dl class="dialog-summary">
              <div><dt>需支付</dt><dd>{{ mystery.npc.price.count.toLocaleString() }} {{ mystery.npc.price.name }}</dd></div>
              <div><dt>支付后余额</dt><dd>{{ mystery.npc.price.balance === null ? '--' : Math.max(0, mystery.npc.price.balance - mystery.npc.price.count).toLocaleString() }}</dd></div>
            </dl>
            <div class="dialog-actions">
              <button type="button" :disabled="mysteryPurchasing" @click="purchaseDialogOpen = false">
                取消
              </button>
              <button type="button" class="dialog-confirm" :disabled="mysteryPurchasing" @click="confirmPurchase">
                <div v-if="mysteryPurchasing" class="i-carbon-circle-dash animate-spin" />
                <div v-else class="i-carbon-shopping-cart-plus" />
                {{ mysteryPurchasing ? '购买中' : '确认购买' }}
              </button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.mystery-page {
  min-height: 100%;
  color: var(--ui-ink);
}
.mystery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px 20px;
  border-bottom: 1px solid var(--ui-border);
}
.mystery-header p {
  margin: 0 0 4px;
  color: var(--ui-violet);
  font-size: 12px;
  font-weight: 600;
}
.mystery-header h1 {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
}
.mystery-header span {
  display: block;
  margin-top: 5px;
  color: var(--ui-muted);
  font-size: 12px;
}
.mystery-header button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  color: var(--ui-violet);
  background: var(--ui-surface);
  cursor: pointer;
}
.mystery-message {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(201, 95, 102, 0.2);
  border-radius: 8px;
  color: #9a4048;
  background: var(--ui-danger-soft);
  font-size: 13px;
}
.mystery-message.success {
  border-color: rgba(67, 141, 99, 0.2);
  color: #2e714b;
  background: var(--ui-primary-soft);
}
.merchant-scene {
  padding: 26px 0;
}
.merchant-identity {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 16px;
}
.merchant-mark {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(143, 121, 188, 0.18);
  border-radius: 50%;
  color: var(--ui-violet);
  background: var(--ui-violet-soft);
  font-size: 25px;
}
.merchant-identity span {
  color: var(--ui-subtle);
  font-size: 11px;
}
.merchant-identity h2 {
  margin: 2px 0;
  font-size: 18px;
}
.merchant-identity p {
  margin: 0;
  color: var(--ui-muted);
  font-size: 12px;
}
.mystery-offer {
  display: grid;
  grid-template-columns: minmax(260px, 36%) 1fr;
  min-height: 390px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-card);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}
.offer-visual {
  position: relative;
  display: grid;
  place-items: center;
  border-right: 1px solid var(--ui-border);
  background: var(--ui-violet-soft);
}
.offer-visual::before {
  position: absolute;
  inset: 12%;
  border: 1px solid rgba(143, 121, 188, 0.18);
  border-radius: 50%;
  content: '';
}
.offer-visual > span {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 5px 10px;
  border-radius: 999px;
  color: white;
  background: var(--ui-danger);
  font-size: 12px;
  font-weight: 700;
}
.offer-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(26px, 5vw, 56px);
}
.offer-content small {
  color: var(--ui-subtle);
}
.offer-content h2 {
  margin: 8px 0 4px;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.2;
}
.offer-content dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin: 28px 0;
}
.offer-content dl > div {
  padding: 12px 0;
  border-block: 1px solid rgba(58, 86, 68, 0.1);
}
.offer-content dt {
  color: var(--ui-muted);
  font-size: 11px;
}
.offer-content dd {
  margin: 5px 0 0;
  font-size: 16px;
  font-weight: 700;
}
.offer-content dd.original {
  color: var(--ui-subtle);
  text-decoration: line-through;
}
.offer-price {
  display: flex;
  align-items: center;
  gap: 10px;
}
.offer-price strong {
  color: var(--ui-warning);
  font-size: 26px;
}
.offer-price span {
  margin-left: auto;
  color: var(--ui-muted);
  font-size: 12px;
}
.purchase-button {
  display: flex;
  width: 100%;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  border: 1px solid var(--ui-primary);
  border-radius: 10px;
  color: white;
  background: var(--ui-primary);
  font-weight: 700;
  cursor: pointer;
}
.purchase-button:disabled {
  border-color: #bdc4be;
  background: #bdc4be;
  cursor: not-allowed;
}
.mystery-state {
  display: flex;
  min-height: 350px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ui-muted);
  text-align: center;
}
.mystery-state > div {
  color: var(--ui-violet);
  font-size: 36px;
}
.mystery-state button {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--ui-primary);
  border-radius: 9px;
  color: white;
  background: var(--ui-primary);
  cursor: pointer;
}
.purchase-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(35, 47, 38, 0.32);
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
}
.purchase-dialog {
  position: relative;
  width: min(420px, 100%);
  padding: 24px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  color: var(--ui-ink);
  background: var(--ui-surface-strong);
  box-shadow: var(--ui-shadow-lg);
}
.dialog-close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 9px;
  color: var(--ui-muted);
  background: var(--ui-surface);
  cursor: pointer;
}
.dialog-kicker {
  color: var(--ui-violet);
  font-size: 11px;
  font-weight: 700;
}
.purchase-dialog h2 {
  margin: 4px 42px 18px 0;
  font-size: 21px;
}
.dialog-goods {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface-soft);
}
.dialog-goods > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.dialog-goods strong {
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dialog-goods span {
  margin-top: 3px;
  color: var(--ui-muted);
  font-size: 12px;
}
.dialog-summary {
  margin: 14px 0 18px;
}
.dialog-summary > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 2px;
  border-bottom: 1px solid var(--ui-border);
}
.dialog-summary dt {
  color: var(--ui-muted);
  font-size: 12px;
}
.dialog-summary dd {
  margin: 0;
  color: var(--ui-warning);
  font-weight: 700;
}
.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.45fr;
  gap: 9px;
}
.dialog-actions button {
  height: 42px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 10px;
  color: var(--ui-ink);
  background: var(--ui-surface);
  font-weight: 700;
  cursor: pointer;
}
.dialog-actions .dialog-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-color: var(--ui-primary);
  color: white;
  background: var(--ui-primary);
}
.dialog-actions button:disabled,
.dialog-close:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.merchant-dialog-enter-active,
.merchant-dialog-leave-active {
  transition: opacity 0.16s ease;
}
.merchant-dialog-enter-active .purchase-dialog,
.merchant-dialog-leave-active .purchase-dialog {
  transition: transform 0.16s ease;
}
.merchant-dialog-enter-from,
.merchant-dialog-leave-to {
  opacity: 0;
}
.merchant-dialog-enter-from .purchase-dialog,
.merchant-dialog-leave-to .purchase-dialog {
  transform: translateY(8px) scale(0.98);
}
@media (max-width: 720px) {
  .mystery-offer {
    grid-template-columns: 1fr;
  }
  .offer-visual {
    min-height: 190px;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
  }
  .offer-content {
    padding: 24px;
  }
  .mystery-header h1 {
    font-size: 24px;
  }
}
</style>
