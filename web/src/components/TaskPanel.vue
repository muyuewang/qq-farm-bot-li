<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import DailyOverview from '@/components/DailyOverview.vue'
import { useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const { status, dailyGifts, realtimeConnected } = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)

const growth = computed(() => dailyGifts.value?.growth || null)
const growthCurrentTask = computed(() => growth.value?.currentTask || growth.value?.tasks?.[0] || null)

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }
    if (acc.running && status.value?.connection?.connected) {
      statusStore.fetchDailyGifts(currentAccountId.value)
    }
  }
}

onMounted(() => {
  refresh()
})

watch(currentAccountId, () => {
  refresh()
})

function formatTaskProgress(task: any) {
  if (!task)
    return '未开始'
  const rawCurrent = task.progress ?? task.current
  const rawTarget = task.totalProgress ?? task.target

  const current = Number.isFinite(rawCurrent)
    ? rawCurrent
    : (rawCurrent ? Number(rawCurrent) || 0 : 0)

  const target = Number.isFinite(rawTarget)
    ? rawTarget
    : (rawTarget ? Number(rawTarget) || 0 : 0)

  if (!current && !target)
    return '未开始'

  if (target && current >= target)
    return '已完成'

  return `进度：${current}/${target}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Daily Overview (Daily Gifts & Tasks) -->
    <DailyOverview :daily-gifts="dailyGifts" />

    <!-- Growth Task -->
    <div class="flex flex-col farm-card rounded-xl p-4">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-2 font-medium" style="color: var(--theme-primary, #22c55e)">
          <span class="i-carbon-growth" />
          <span>成长任务</span>
        </h3>
        <span
          v-if="growth"
          class="rounded-lg bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600 font-bold dark:bg-blue-900/20 dark:text-blue-400"
        >
          {{ growthCurrentTask ? `${growthCurrentTask.progress}/${growthCurrentTask.totalProgress}` : '暂无任务' }}
        </span>
      </div>

      <div
        v-if="!currentAccountId"
        class="flex flex-col items-center justify-center gap-3 rounded-xl py-8 text-center"
        style="background: color-mix(in srgb, var(--theme-bg, #fff) 90%, var(--theme-primary, #3b82f6))"
      >
        <div class="i-carbon-user-avatar text-3xl" style="opacity: 0.5" />
        <div>
          <div class="text-sm font-medium" style="color: var(--theme-text, #374151)">
            未登录账号
          </div>
          <div class="mt-1 text-xs text-gray-400">
            请先添加农场账号
          </div>
        </div>
      </div>
      <div
        v-else-if="!status?.connection?.connected"
        class="flex flex-col items-center justify-center gap-3 rounded-xl py-8 text-center"
        style="background: color-mix(in srgb, var(--theme-bg, #fff) 90%, var(--theme-primary, #3b82f6))"
      >
        <div class="i-carbon-network-4 text-3xl" style="opacity: 0.5" />
        <div>
          <div class="text-sm font-medium" style="color: var(--theme-text, #374151)">
            账号未登录
          </div>
          <div class="mt-1 text-xs text-gray-400">
            请先运行账号或检查网络连接
          </div>
        </div>
      </div>
      <div
        v-else-if="growth && growth.tasks && growth.tasks.length"
        class="space-y-2"
      >
        <div
          v-for="(task, idx) in growth.tasks"
          :key="task.id || idx"
          class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
        >
          <span style="color: var(--theme-text, #6b7280); opacity: 0.85">{{ task.desc || task.name }}</span>
          <span class="text-xs text-gray-500">{{ formatTaskProgress(task) }}</span>
        </div>
      </div>
      <div v-else class="text-center text-sm text-gray-400">
        暂无任务详情
      </div>
    </div>
  </div>
</template>
