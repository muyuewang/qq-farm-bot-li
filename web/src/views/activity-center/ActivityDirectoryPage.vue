<script setup lang="ts">
import type { ActivityDirectoryItemDto } from '@/stores/activity-center'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { activityHasGameplay } from '@/components/activity/gameplays'
import { useAccountStore } from '@/stores/account'
import { useActivityCenterStore } from '@/stores/activity-center'
import { useActivityClock } from './useActivityClock'

const emit = defineEmits<{
  back: []
  open: [activity: ActivityDirectoryItemDto]
}>()

const accountStore = useAccountStore()
const activityStore = useActivityCenterStore()
const { currentAccountId } = storeToRefs(accountStore)
const { activities, season, shop, solarTerms, constellation, qixi, qingMei, charity, weather, loading, error, loadedAccountId } = storeToRefs(activityStore)
const { serverNow } = useActivityClock()

type ActivityStatus = 'active' | 'upcoming' | 'ended'

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const accountDataLoaded = computed(() => !!currentAccountId.value && loadedAccountId.value === String(currentAccountId.value))
const stellarDetailsAvailable = computed(() => !!(season.value || shop.value || constellation.value || solarTerms.value))
const displayActivities = computed<ActivityDirectoryItemDto[]>(() => {
  const entries: ActivityDirectoryItemDto[] = activities.value.length > 0
    ? [...activities.value]
    : stellarDetailsAvailable.value
      ? [{
        id: season.value?.pass?.activityId || season.value?.id || 'stellar',
        activityIds: [season.value?.pass?.activityId || season.value?.id || 'stellar'],
        name: season.value?.title || '千星游记',
        startTime: season.value?.startTime || null,
        endTime: season.value?.endTime || null,
        gameplayKey: 'stellar',
        gameplayTargets: ['travel', 'constellation', 'shop', 'solar'],
        detailTarget: season.value?.pass ? 'travel' : constellation.value ? 'constellation' : shop.value ? 'shop' : 'solar',
      } satisfies ActivityDirectoryItemDto]
      : []

  const appendDetailEntry = (entry: ActivityDirectoryItemDto) => {
    if (!entries.some(item => item.activityIds.some(id => entry.activityIds.includes(id))))
      entries.push(entry)
  }
  if (qixi.value) {
    appendDetailEntry({
      id: qixi.value.groupId || qixi.value.activityId,
      activityIds: [qixi.value.groupId, qixi.value.bridgeActivityId, qixi.value.giftActivityId].filter(Boolean),
      name: qixi.value.title,
      startTime: qixi.value.startTime,
      endTime: qixi.value.endTime,
      gameplayKey: 'qixi',
      gameplayTargets: ['qixi'],
      detailTarget: 'qixi',
    })
  }
  if (qingMei.value) {
    appendDetailEntry({
      id: qingMei.value.activityId,
      activityIds: [qingMei.value.dailyActivityId, qingMei.value.activityId].filter(Boolean),
      name: qingMei.value.title,
      startTime: qingMei.value.startTime,
      endTime: qingMei.value.endTime,
      gameplayKey: 'qingmei',
      gameplayTargets: ['qingmei'],
      detailTarget: 'qingmei',
    })
  }
  if (charity.value) {
    appendDetailEntry({
      id: charity.value.groupId || charity.value.activityId,
      activityIds: [charity.value.groupId, charity.value.activityId].filter(Boolean),
      name: charity.value.title,
      startTime: charity.value.startTime,
      endTime: charity.value.endTime,
      gameplayKey: 'charity',
      gameplayTargets: ['charity'],
      detailTarget: 'charity',
    })
  }
  if (weather.value) {
    appendDetailEntry({
      id: weather.value.groupId || weather.value.activityId,
      activityIds: [weather.value.groupId, weather.value.catalogActivityId, weather.value.taskActivityId, weather.value.researchActivityId].filter(Boolean),
      name: weather.value.title,
      startTime: weather.value.startTime,
      endTime: weather.value.endTime,
      gameplayKey: 'weather',
      gameplayTargets: ['weather'],
      detailTarget: 'weather',
    })
  }

  const statusRank: Record<ActivityStatus, number> = { active: 0, upcoming: 1, ended: 2 }
  return entries.sort((left, right) => {
    const leftStatus = activityStatus(left)
    const rightStatus = activityStatus(right)
    if (leftStatus !== rightStatus)
      return statusRank[leftStatus] - statusRank[rightStatus]
    if (leftStatus === 'ended')
      return (right.endTime || 0) - (left.endTime || 0)
    return (left.startTime || 0) - (right.startTime || 0)
  })
})
const hasActivities = computed(() => displayActivities.value.length > 0)

function accountId() {
  return String(currentAccountId.value || '')
}
function load(force = false) {
  return force ? activityStore.refresh(accountId()) : activityStore.lazyLoad(accountId())
}
function validActivityTime(value: unknown): number | null {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null
}
function activityStatus(activity: ActivityDirectoryItemDto): ActivityStatus {
  const startTime = validActivityTime(activity.startTime)
  const endTime = validActivityTime(activity.endTime)
  if (endTime !== null && serverNow.value >= endTime)
    return 'ended'
  if (startTime !== null && serverNow.value < startTime)
    return 'upcoming'
  return 'active'
}
function activityStatusLabel(activity: ActivityDirectoryItemDto) {
  return { active: '进行中', upcoming: '未开始', ended: '已结束' }[activityStatus(activity)]
}
function activityCanOpen(activity: ActivityDirectoryItemDto) {
  return activityHasGameplay(activity) && activityStatus(activity) === 'active'
}
function formatActivityPeriod(activity: ActivityDirectoryItemDto) {
  const startTime = validActivityTime(activity.startTime)
  const endTime = validActivityTime(activity.endTime)
  const start = startTime === null ? '' : dateFormatter.format(startTime)
  const end = endTime === null ? '' : dateFormatter.format(endTime)
  if (start && end)
    return `${start} - ${end}`
  if (start)
    return `${start} 开始`
  if (end)
    return `${end} 结束`
  return '活动时间待定'
}
function openActivity(activity: ActivityDirectoryItemDto) {
  if (activityCanOpen(activity))
    emit('open', activity)
}
</script>

<template>
  <section class="activity-picker">
    <button type="button" class="picker-back" aria-label="返回" @click="emit('back')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
    </button>
    <header class="picker-heading">
      <span>活动中心</span>
      <h1>{{ accountDataLoaded && !loading && !hasActivities ? '当前无活动' : '活动列表' }}</h1>
    </header>
    <div v-if="!currentAccountId" class="picker-state">
      <div class="i-carbon-user-avatar" />
      <strong>请先选择账号</strong>
      <span>选择账号后查看当前活动</span>
    </div>
    <div v-else-if="loading && !accountDataLoaded" class="picker-state">
      <div class="activity-spinner picker-spinner" />
      <strong>正在加载活动</strong>
    </div>
    <div v-else-if="error && !hasActivities" class="picker-state">
      <div class="i-carbon-warning-alt" />
      <strong>活动加载失败</strong>
      <span>{{ error }}</span>
      <button type="button" :disabled="loading" @click="load(true)">
        重新加载
      </button>
    </div>
    <div v-else-if="accountDataLoaded && !loading && !hasActivities" class="picker-state empty-activities">
      <div class="i-carbon-calendar" />
      <strong>当前无活动</strong>
      <span>服务器暂未返回活动配置</span>
      <button type="button" @click="load(true)">
        刷新活动
      </button>
    </div>
    <div v-else class="picker-list">
      <button
        v-for="activity in displayActivities"
        :key="activity.id"
        type="button"
        class="activity-entry"
        :class="[`activity-entry--${activityStatus(activity)}`, { 'activity-entry--supported': activityCanOpen(activity) }]"
        :disabled="!activityCanOpen(activity)"
        @click="openActivity(activity)"
      >
        <span class="activity-entry__topline">
          <span class="activity-entry__icon"><img v-if="activity.gameplayKey === 'pet'" src="/activity-assets/pet-diary/S3Open_dog_1.png" alt="" style="width: 36px; height: 36px; object-fit: contain"><span v-else class="i-carbon-calendar" /></span>
          <span class="activity-entry__status">{{ activityStatusLabel(activity) }}</span>
        </span>
        <strong>{{ activity.gameplayKey === 'pet' ? '萌宠日记' : activity.name }}</strong>
        <span class="activity-entry__period">{{ formatActivityPeriod(activity) }}</span>
        <span class="activity-entry__footer">
          <small>{{ activity.id }}</small>
          <span v-if="activityCanOpen(activity)">查看详情 <span class="i-carbon-arrow-right" /></span>
          <span v-else-if="activityStatus(activity) === 'ended'">活动已结束 <span class="i-carbon-locked" /></span>
          <span v-else-if="activityStatus(activity) === 'upcoming'">活动未开始 <span class="i-carbon-locked" /></span>
          <span v-else>暂未支持详情 <span class="i-carbon-locked" /></span>
        </span>
      </button>
    </div>
  </section>
</template>
