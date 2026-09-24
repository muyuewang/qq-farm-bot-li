<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MallCatalogPanel from '@/components/commerce/MallCatalogPanel.vue'
import MysteryShopPanel from '@/components/commerce/MysteryShopPanel.vue'
import { useCommerceStore } from '@/stores/commerce'

type MallTab = 'mall' | 'svip' | 'mystery'

const route = useRoute()
const router = useRouter()
const { purchasingGoodsId, mysteryPurchasing } = storeToRefs(useCommerceStore())
const tabs: Array<{ key: MallTab, label: string }> = [
  { key: 'mall', label: '游戏商城' },
  { key: 'svip', label: 'SVIP 专属商城' },
  { key: 'mystery', label: '神秘商人' },
]
const activeTab = computed<MallTab>(() => route.query.tab === 'mystery' || route.query.tab === 'svip' ? route.query.tab : 'mall')
const purchasing = computed(() => purchasingGoodsId.value !== null || mysteryPurchasing.value)

function selectTab(tab: MallTab) {
  if (purchasing.value || tab === activeTab.value)
    return
  router.replace({ query: { ...route.query, tab: tab === 'mall' ? undefined : tab }, hash: route.hash })
}
</script>

<template>
  <div class="mall-page">
    <header class="mall-heading">
      <p>QQ 农场</p>
      <h1>游戏商城</h1>
    </header>

    <nav class="mall-sections" aria-label="商城分类">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        :class="{ active: activeTab === tab.key }"
        :aria-current="activeTab === tab.key ? 'page' : undefined"
        :disabled="purchasing"
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <MysteryShopPanel v-if="activeTab === 'mystery'" />
    <MallCatalogPanel v-else :slot-type="activeTab === 'svip' ? 4 : 1" />
  </div>
</template>

<style scoped>
.mall-page {
  min-height: 100%;
  color: var(--ui-ink);
}
.mall-heading {
  padding: 4px 2px 20px;
  border-bottom: 1px solid var(--ui-border);
}
.mall-heading p {
  margin: 0 0 4px;
  color: var(--ui-primary);
  font-size: 12px;
  font-weight: 600;
}
.mall-heading h1 {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
}
.mall-sections {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin-top: 16px;
  padding-bottom: 2px;
}
.mall-sections button {
  flex-shrink: 0;
  height: 34px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--ui-muted);
  background: transparent;
  white-space: nowrap;
  cursor: pointer;
}
.mall-sections button:hover {
  background: var(--ui-surface-soft);
}
.mall-sections button.active {
  border-color: rgba(67, 141, 99, 0.17);
  color: var(--ui-primary);
  background: var(--ui-primary-soft);
  font-weight: 700;
}
.mall-sections button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
