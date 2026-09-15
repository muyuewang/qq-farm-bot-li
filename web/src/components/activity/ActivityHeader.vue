<script setup lang="ts">
defineProps<{
  title: string
  remaining?: string
  balance?: string
  currencyImage?: string
  currencyName?: string
  loading?: boolean
  showRefresh?: boolean
}>()

defineEmits<{
  back: []
  refresh: []
}>()
</script>

<template>
  <header class="activity-header">
    <div class="activity-header__brand">
      <button type="button" class="activity-header__back" aria-label="返回活动列表" @click="$emit('back')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4-8 8 8 8" /></svg>
        <span>活动列表</span>
      </button>
      <div class="activity-header__title">
        <small>活动中心</small>
        <h1>{{ title || '活动详情' }}</h1>
      </div>
    </div>
    <div v-if="balance !== undefined" class="activity-header__balance" :title="currencyName">
      <img v-if="currencyImage" :src="currencyImage" alt="">
      <b>{{ balance || '--' }}</b>
    </div>
    <button v-if="showRefresh" class="activity-header__refresh" type="button" :disabled="loading" aria-label="刷新活动数据" @click="$emit('refresh')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7v5h-5M5 17v-5h5" /><path d="M18 12a6 6 0 0 0-10.2-4.3L5 10m1 2a6 6 0 0 0 10.2 4.3L19 14" /></svg>
    </button>
    <div v-if="remaining" class="activity-header__time">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 3h6" /></svg>
      {{ remaining }}
    </div>
  </header>
</template>

<style scoped>
.activity-header {
  position: absolute;
  z-index: 20;
  inset: 0 0 auto;
  height: calc(86px + env(safe-area-inset-top));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: env(safe-area-inset-top) 22px 0;
  border-bottom: 1px solid var(--ui-border);
  background: rgba(250, 251, 247, 0.82);
  backdrop-filter: blur(20px) saturate(135%);
}
.activity-header__brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
}
.activity-header__back,
.activity-header__refresh {
  width: 38px;
  height: 38px;
  display: grid;
  flex: none;
  place-items: center;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  color: var(--ui-primary);
  background: var(--ui-surface);
  cursor: pointer;
}
.activity-header__back {
  width: auto;
  grid-auto-flow: column;
  gap: 4px;
  padding: 0 10px 0 7px;
}
.activity-header__back svg {
  width: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.activity-header__back span {
  font-size: 12px;
  font-weight: 700;
}
.activity-header__title {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.activity-header__title small {
  color: var(--ui-muted);
  font-size: 10px;
  font-weight: 700;
}
h1 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-header__balance,
.activity-header__time {
  display: flex;
  align-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface);
}
.activity-header__balance {
  min-width: 72px;
  height: 34px;
  justify-content: center;
  gap: 5px;
  padding: 3px 10px 3px 5px;
  color: var(--ui-warning);
  font-size: 12px;
}
.activity-header__balance img {
  width: 25px;
  height: 25px;
  object-fit: contain;
}
.activity-header__refresh:disabled {
  opacity: 0.55;
  cursor: wait;
}
.activity-header__refresh svg {
  width: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.activity-header__time {
  max-width: 230px;
  gap: 5px;
  padding: 7px 11px;
  overflow: hidden;
  color: var(--ui-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-header__time svg {
  width: 14px;
  height: 14px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
@media (max-width: 900px) {
  .activity-header {
    height: calc(72px + env(safe-area-inset-top));
    padding-right: 12px;
    padding-left: 12px;
    gap: 7px;
  }
  .activity-header__back,
  .activity-header__refresh {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
  .activity-header__back {
    width: 34px;
    padding: 0;
  }
  .activity-header__back span,
  .activity-header__title small {
    display: none;
  }
  h1 {
    font-size: 17px;
  }
  .activity-header__time {
    display: none;
  }
  .activity-header__balance {
    min-width: 58px;
    padding-right: 7px;
  }
}
</style>
