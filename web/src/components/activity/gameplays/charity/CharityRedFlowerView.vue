<script setup lang="ts">
import type { CharityRedFlowerActivityDto } from '@/stores/activity-center'
import { computed, ref, watch } from 'vue'
import CharityAgreementDialog from './CharityAgreementDialog.vue'

const props = defineProps<{
  activity: CharityRedFlowerActivityDto | null
  pendingAgreement: boolean
  pendingShare: boolean
  pendingSeeds: boolean
  pendingDonate: boolean
  pendingProgress: boolean
  pendingDailyGift: boolean
  authorizationError?: string
}>()

const emit = defineEmits<{
  acceptAgreement: []
  share: []
  claimSeeds: []
  donateLove: []
  claimProgressReward: [target: string]
  claimDailyGift: []
  retry: []
}>()

const confirmingDonate = ref(false)
const agreementDialogOpen = ref(false)
const agreementRequired = computed(() => !!props.activity && props.activity.agreementStatus !== '1')

const globalPercent = computed(() => {
  const donated = Number(props.activity?.globalProgress.donated || 0)
  const target = Number(props.activity?.globalProgress.target || 0)
  if (!Number.isFinite(donated) || !Number.isFinite(target) || target <= 0)
    return 0
  return Math.min(100, Math.max(0, donated / target * 100))
})

const seedStatus = computed(() => {
  if (props.activity?.seedReward.claimed)
    return '今日已领取'
  if (props.activity?.seedReward.claimable)
    return '可以领取'
  const tasks = props.activity?.taskSummary
  if (tasks && tasks.totalCount > 0) {
    if (tasks.claimedCount >= tasks.totalCount)
      return `今日种子任务 ${tasks.claimedCount}/${tasks.totalCount} 已领取`
    return `今日种子任务 ${tasks.completedCount}/${tasks.totalCount} 已完成`
  }
  return '完成今日任务后可领取'
})

const dailyGiftStatus = computed(() => {
  if (props.activity?.dailyGift.claimed)
    return '今日已送，仍可再次尝试'
  if (props.activity?.settlement.eligible)
    return '已获得公益金资格，可以送出并领取礼包'
  if (Number(props.activity?.loveBalance || 0) > 0)
    return '请先送出当前爱心'
  if ((props.activity?.lands?.harvestable || 0) > 0)
    return '小红花已经成熟，收获后可领取'
  if ((props.activity?.lands?.growing || 0) > 0)
    return '小红花生长中，收获后可领取'
  return '今日收获小红花后可尝试领取'
})

const seedBalance = computed(() => props.activity?.inventory?.seed.count || '0')

function taskStatus(task: NonNullable<CharityRedFlowerActivityDto['taskSummary']>['tasks'][number]) {
  if (task.claimed)
    return '已领取'
  if (task.claimable)
    return '待领取'
  if (task.completed)
    return '已完成'
  return `${formatCount(task.progress)} / ${formatCount(task.target)}`
}

function landStatus(status: 'growing' | 'harvestable' | 'dead') {
  if (status === 'harvestable')
    return '可收获'
  if (status === 'dead')
    return '已枯死'
  return '生长中'
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return '即将成熟'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  return hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`
}

function formatCount(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('zh-CN').format(number) : value || '0'
}

function formatFundDate(value: string) {
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value
}

function requestDonation() {
  confirmingDonate.value = true
}

function confirmDonation() {
  confirmingDonate.value = false
  emit('donateLove')
}

function openAgreement() {
  agreementDialogOpen.value = true
}

function handleShare() {
  if (agreementRequired.value) {
    openAgreement()
    return
  }
  emit('share')
}

function acceptAgreement() {
  emit('acceptAgreement')
}

watch(() => props.activity?.loveBalance, () => confirmingDonate.value = false)
watch(
  () => [props.activity?.activityId, props.activity?.agreementStatus] as const,
  ([activityId, agreementStatus]) => {
    if (!activityId) {
      agreementDialogOpen.value = false
      return
    }
    if (agreementStatus === '1') {
      agreementDialogOpen.value = false
      return
    }
    agreementDialogOpen.value = true
  },
  { immediate: true },
)
</script>

<template>
  <div class="charity-page">
    <template v-if="activity">
      <section class="overview-band">
        <div class="overview-title">
          <span class="overview-mark i-carbon-favorite-filled" />
          <div>
            <small>我的公益进度</small>
            <h2>每一份爱心都会计入累计捐赠</h2>
          </div>
        </div>
        <div class="overview-metrics">
          <div>
            <span>当前爱心</span>
            <strong>{{ formatCount(activity.loveBalance) }}</strong>
          </div>
          <div>
            <span>累计捐赠</span>
            <strong>{{ formatCount(activity.donatedLove) }}</strong>
          </div>
          <div>
            <span>结算资格</span>
            <strong :class="{ eligible: activity.settlement.eligible }">
              {{ activity.settlement.eligible ? '已达成' : `${formatCount(activity.donatedLove)} / ${formatCount(activity.settlement.requiredLove)}` }}
            </strong>
          </div>
        </div>
      </section>

      <section class="global-band">
        <header>
          <div>
            <small>全服共同目标</small>
            <h2>公益爱心进度</h2>
          </div>
          <strong>{{ globalPercent.toFixed(2) }}%</strong>
        </header>
        <div class="global-track" role="progressbar" :aria-valuenow="globalPercent" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: `${globalPercent}%` }" />
        </div>
        <div class="global-detail">
          <span>{{ formatCount(activity.globalProgress.donated) }} / {{ formatCount(activity.globalProgress.target) }} 爱心</span>
          <div class="inline-reward">
            <img v-if="activity.globalProgress.reward.image" :src="activity.globalProgress.reward.image" alt="">
            <span>目标奖励 {{ activity.globalProgress.reward.name || activity.globalProgress.reward.id }}</span>
            <b>×{{ activity.globalProgress.reward.count }}</b>
          </div>
        </div>
      </section>

      <section class="activity-state-section">
        <header class="section-heading">
          <div>
            <small>实机状态对齐</small>
            <h2>任务、种子与土地</h2>
          </div>
          <span class="flow-label">
            流程 {{ activity.flowStatus || '-' }} · 种子 {{ activity.seedReward.statusCode || '-' }} · 公益协议 {{ activity.agreementStatus || '-' }}
          </span>
        </header>

        <div class="state-grid">
          <article class="state-card inventory-card">
            <div class="state-card-title">
              <span class="i-carbon-sprout" />
              <div><small>当前库存</small><strong>可用小红花种子</strong></div>
            </div>
            <b>{{ formatCount(seedBalance) }}</b>
            <span>爱心背包 {{ formatCount(activity.inventory?.love.count || activity.loveBalance) }}</span>
          </article>

          <article class="state-card task-card">
            <div class="state-card-title">
              <span class="i-carbon-task-complete" />
              <div>
                <small>每日种子任务</small>
                <strong v-if="activity.taskSummary">
                  {{ activity.taskSummary.completedCount }} / {{ activity.taskSummary.totalCount }} 已完成
                </strong>
                <strong v-else>状态读取失败</strong>
              </div>
            </div>
            <ul v-if="activity.taskSummary?.tasks.length" class="task-list">
              <li v-for="task in activity.taskSummary.tasks" :key="task.id">
                <span>
                  {{ task.description || `任务 ${task.id}` }}
                  <small v-if="Number(task.shareMultiple) > 1">分享可 ×{{ task.shareMultiple }}</small>
                </span>
                <span class="task-reward">
                  <img v-if="task.seedReward.image" :src="task.seedReward.image" alt="">
                  ×{{ task.seedReward.count }}
                </span>
                <b :class="{ done: task.completed }">{{ taskStatus(task) }}</b>
              </li>
            </ul>
            <p v-else>没有读到小红花种子任务。</p>
          </article>

          <article class="state-card land-card">
            <div class="state-card-title">
              <span class="i-carbon-soil-moisture" />
              <div><small>小红花土地</small><strong>{{ activity.lands?.total || 0 }} 块</strong></div>
            </div>
            <div v-if="activity.lands" class="land-metrics">
              <span>生长中 <b>{{ activity.lands.growing }}</b></span>
              <span>可收获 <b>{{ activity.lands.harvestable }}</b></span>
              <span>已枯死 <b>{{ activity.lands.dead }}</b></span>
            </div>
            <ul v-if="activity.lands?.details.length" class="land-list">
              <li v-for="land in activity.lands.details" :key="land.landId">
                <span>土地 {{ land.landId }}</span>
                <b :class="land.status">{{ landStatus(land.status) }}</b>
                <small v-if="land.status === 'growing'">约 {{ formatDuration(land.matureInSec) }}</small>
              </li>
            </ul>
            <p v-else>当前没有种植小红花。</p>
          </article>
        </div>

        <p v-if="Object.keys(activity.supplementalErrors).length" class="supplemental-warning">
          部分状态读取失败，请稍后刷新：{{ Object.values(activity.supplementalErrors).join('；') }}
        </p>
      </section>

      <section class="commands-section">
        <header class="section-heading">
          <div>
            <small>每日公益行动</small>
            <h2>领取与捐赠</h2>
          </div>
        </header>

        <div class="command-grid">
          <article class="command-item share-command">
            <div class="command-icon i-carbon-share" />
            <div class="command-copy">
              <small>每日分享</small>
              <strong>分享活动可获得小红花种子</strong>
              <div class="inline-reward">
                <img v-if="activity.seedReward.reward.image" :src="activity.seedReward.reward.image" alt="">
                <span>{{ activity.seedReward.reward.name || activity.seedReward.reward.id }}</span>
                <b>×{{ activity.seedReward.reward.count }}</b>
              </div>
              <span>每日仅首次有效，实际到账以活动返回为准</span>
            </div>
            <button
              type="button"
              :disabled="pendingShare || pendingAgreement || !activity.active || (activity.agreementStatus === '1' && !activity.actions.share.enabled)"
              @click="handleShare"
            >
              <span v-if="pendingShare || pendingAgreement" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-share" />
              {{ pendingAgreement ? '授权中' : pendingShare ? '分享中' : activity.agreementStatus !== '1' ? '完成授权' : '分享活动' }}
            </button>
          </article>

          <article class="command-item seed-command">
            <div class="command-icon i-carbon-sprout" />
            <div class="command-copy">
              <small>每日种子</small>
              <strong>{{ seedStatus }}</strong>
              <div class="inline-reward">
                <img v-if="activity.seedReward.reward.image" :src="activity.seedReward.reward.image" alt="">
                <span>{{ activity.seedReward.reward.name || activity.seedReward.reward.id }}</span>
                <b>×{{ activity.seedReward.reward.count }}</b>
              </div>
            </div>
            <button
              type="button"
              :disabled="pendingSeeds || !activity.actions.claimSeeds.enabled"
              @click="emit('claimSeeds')"
            >
              <span v-if="pendingSeeds" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-download" />
              {{ pendingSeeds ? '领取中' : activity.seedReward.claimed ? '已领取' : '领取种子' }}
            </button>
          </article>

          <article class="command-item donate-command">
            <div class="command-icon i-carbon-favorite" />
            <div class="command-copy">
              <small>爱心捐赠</small>
              <strong>本次将捐赠全部 {{ formatCount(activity.loveBalance) }} 份</strong>
              <span>协议会一次性清空当前爱心余额</span>
            </div>
            <div v-if="confirmingDonate" class="confirm-actions">
              <button type="button" class="secondary" :disabled="pendingDonate" @click="confirmingDonate = false">
                取消
              </button>
              <button type="button" :disabled="pendingDonate" @click="confirmDonation">
                <span class="i-carbon-send-alt" />确认捐赠
              </button>
            </div>
            <button
              v-else
              type="button"
              :disabled="pendingDonate || !activity.actions.donateLove.enabled"
              @click="requestDonation"
            >
              <span v-if="pendingDonate" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-send-alt" />
              {{ pendingDonate ? '捐赠中' : `捐赠全部 ${formatCount(activity.loveBalance)}` }}
            </button>
          </article>

          <article class="command-item gift-command">
            <div class="command-icon i-carbon-gift" />
            <div class="command-copy">
              <small>每日公益礼包</small>
              <strong>{{ dailyGiftStatus }}</strong>
              <div class="inline-reward">
                <img v-if="activity.dailyGift.reward.image" :src="activity.dailyGift.reward.image" alt="">
                <span>{{ activity.dailyGift.reward.name || activity.dailyGift.reward.id }}</span>
                <b>×{{ activity.dailyGift.reward.count }}</b>
              </div>
              <span v-if="activity.dailyGift.publicFund">公益记录 {{ formatFundDate(activity.dailyGift.publicFund.date) }}</span>
            </div>
            <button
              type="button"
              :disabled="pendingDailyGift || !activity.actions.claimDailyGift.enabled"
              @click="emit('claimDailyGift')"
            >
              <span v-if="pendingDailyGift" class="i-carbon-circle-dash animate-spin" />
              <span v-else class="i-carbon-gift" />
              {{ pendingDailyGift ? '送出中' : activity.dailyGift.claimed ? '今日已送' : '送出公益金' }}
            </button>
          </article>
        </div>
      </section>

      <section class="progress-section">
        <header class="section-heading">
          <div>
            <small>个人累计捐赠</small>
            <h2>进度奖励</h2>
          </div>
          <span class="readonly-label">达到档位后可直接领取</span>
        </header>
        <div class="milestone-track">
          <article
            v-for="reward in activity.progressRewards"
            :key="reward.target"
            class="milestone"
            :class="{ reached: reward.reached, claimed: reward.claimed }"
          >
            <span class="milestone-dot">
              <span v-if="reward.reached" class="i-carbon-checkmark" />
              <span v-else class="i-carbon-favorite" />
            </span>
            <strong>{{ reward.target }} 爱心</strong>
            <div class="milestone-reward">
              <img v-if="reward.reward.image" :src="reward.reward.image" alt="">
              <span>{{ reward.reward.name || reward.reward.id }}</span>
              <b>×{{ reward.reward.count }}</b>
            </div>
            <small>{{ reward.claimed ? '已领取' : reward.claimable ? '已达成，可领取' : '尚未达成' }}</small>
            <button
              v-if="reward.claimSupported"
              type="button"
              class="milestone-claim"
              :disabled="pendingProgress || !reward.claimable"
              @click="emit('claimProgressReward', reward.target)"
            >
              <span v-if="pendingProgress && reward.claimable" class="i-carbon-circle-dash animate-spin" />
              <span v-else-if="reward.claimed" class="i-carbon-checkmark" />
              <span v-else class="i-carbon-download" />
              {{ reward.claimed ? '已领取' : pendingProgress && reward.claimable ? '领取中' : '领取奖励' }}
            </button>
          </article>
        </div>
      </section>

      <section class="settlement-band">
        <div>
          <span class="i-carbon-trophy" />
          <div>
            <small>活动结算奖励</small>
            <strong>累计捐赠 {{ activity.settlement.requiredLove }} 份爱心</strong>
          </div>
        </div>
        <div class="inline-reward">
          <img v-if="activity.settlement.reward.image" :src="activity.settlement.reward.image" alt="">
          <span>{{ activity.settlement.reward.name || activity.settlement.reward.id }}</span>
          <b>×{{ activity.settlement.reward.count }}</b>
        </div>
        <span class="settlement-status" :class="{ eligible: activity.settlement.eligible }">
          {{ activity.settlement.eligible ? '已获得结算资格' : `还差 ${Math.max(0, Number(activity.settlement.requiredLove) - Number(activity.donatedLove))} 份爱心` }}
        </span>
      </section>

      <details v-if="activity.rules.paragraphs.length" class="rules-section">
        <summary>{{ activity.rules.title || '活动说明' }}</summary>
        <p v-for="line in activity.rules.paragraphs" :key="line">
          {{ line }}
        </p>
      </details>
    </template>

    <div v-else class="empty-state">
      <span class="i-carbon-favorite" />
      <strong>公益小红花活动详情读取失败</strong>
      <p>这不代表账号未授权。请重新加载；若仍失败，错误提示中的阶段和追踪编号可用于定位具体链路。</p>
      <button type="button" @click="emit('retry')">
        <span class="i-carbon-renew" />
        重新加载活动
      </button>
    </div>

    <CharityAgreementDialog
      :open="agreementDialogOpen && agreementRequired"
      :pending="pendingAgreement"
      :status-known="!!activity"
      :error-message="authorizationError"
      @accept="acceptAgreement"
      @close="agreementDialogOpen = false"
    />
  </div>
</template>

<style scoped>
.charity-page {
  min-height: 100%;
  padding: 22px 18px 56px;
  color: #253730;
  background: #f5f7f4;
}

.overview-band,
.global-band,
.activity-state-section,
.commands-section,
.progress-section,
.settlement-band,
.rules-section {
  width: min(1120px, 100%);
  margin: 0 auto 14px;
  border: 1px solid #dce3de;
  border-radius: 8px;
  background: #fff;
}

.overview-band {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(420px, 1.2fr);
  align-items: center;
  gap: 24px;
  padding: 20px 22px;
  border-top: 4px solid #d94c58;
}

.overview-title,
.overview-metrics,
.command-item,
.section-heading,
.global-band header,
.global-detail,
.settlement-band,
.settlement-band > div,
.inline-reward,
.confirm-actions {
  display: flex;
  align-items: center;
}

.overview-title {
  gap: 14px;
}

.overview-mark {
  color: #d94c58;
  font-size: 34px;
}

.overview-title div,
.section-heading div,
.command-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

small {
  color: #718078;
  font-size: 11px;
}

h2 {
  margin: 2px 0 0;
  font-size: 17px;
  letter-spacing: 0;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid #e1e6e2;
  border-radius: 7px;
  background: #e1e6e2;
}

.overview-metrics > div {
  min-width: 0;
  padding: 12px 14px;
  background: #f9faf9;
}

.overview-metrics span,
.overview-metrics strong {
  display: block;
}

.overview-metrics span {
  color: #718078;
  font-size: 11px;
}

.overview-metrics strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: 19px;
}

.eligible {
  color: #17835b;
}

.global-band {
  padding: 18px 22px;
}

.global-band header,
.global-detail,
.section-heading,
.settlement-band {
  justify-content: space-between;
  gap: 16px;
}

.global-band header > strong {
  color: #245f88;
  font-size: 20px;
}

.global-track {
  height: 10px;
  overflow: hidden;
  margin: 14px 0 10px;
  border-radius: 5px;
  background: #e5ecef;
}

.global-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2c7ea8;
  transition: width 240ms ease;
}

.global-detail > span {
  color: #53635b;
  font-size: 12px;
}

.inline-reward {
  min-width: 0;
  gap: 7px;
  color: #53635b;
  font-size: 12px;
}

.inline-reward img,
.milestone-reward img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.inline-reward b,
.milestone-reward b {
  color: #253730;
}

.commands-section,
.activity-state-section,
.progress-section {
  padding: 18px 22px 22px;
}

.section-heading {
  margin-bottom: 14px;
}

.command-item button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  background: #247455;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.readonly-label,
.flow-label,
.settlement-status {
  flex: none;
  color: #53635b;
  font-size: 12px;
  font-weight: 700;
}

.flow-label {
  padding: 5px 8px;
  border-radius: 5px;
  color: #5b6c63;
  background: #eef2ef;
}

.state-grid {
  display: grid;
  grid-template-columns: minmax(180px, 0.55fr) minmax(360px, 1.35fr) minmax(260px, 0.9fr);
  gap: 10px;
}

.state-card {
  min-width: 0;
  padding: 15px;
  border: 1px solid #e1e6e2;
  border-radius: 7px;
  background: #f9faf9;
}

.state-card-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.state-card-title > span {
  color: #247455;
  font-size: 23px;
}

.state-card-title div {
  display: flex;
  flex-direction: column;
}

.inventory-card > b {
  display: block;
  margin: 14px 0 1px;
  color: #247455;
  font-size: 30px;
}

.inventory-card > span,
.state-card p {
  margin: 5px 0 0;
  color: #718078;
  font-size: 11px;
}

.task-list,
.land-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.task-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  padding: 7px 0;
  border-top: 1px solid #e6ebe7;
  font-size: 11px;
}

.task-list li > span:first-child,
.task-list li > span:first-child small {
  display: block;
}

.task-list li > span:first-child small {
  color: #8a7560;
}

.task-reward {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #53635b;
}

.task-reward img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.task-list b,
.land-list b {
  color: #7c887f;
  font-size: 11px;
}

.task-list b.done,
.land-list b.harvestable {
  color: #17835b;
}

.land-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 12px;
}

.land-metrics span {
  padding: 7px 5px;
  border-radius: 5px;
  text-align: center;
  color: #718078;
  font-size: 10px;
  background: #eef2ef;
}

.land-metrics b {
  display: block;
  color: #253730;
  font-size: 15px;
}

.land-list li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 7px;
  padding: 6px 0;
  border-top: 1px solid #e6ebe7;
  font-size: 11px;
}

.land-list small {
  color: #718078;
}

.land-list b.dead {
  color: #b75050;
}

.supplemental-warning {
  margin: 10px 0 0;
  color: #9c672f;
  font-size: 11px;
}

.command-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 14px;
  border: 1px solid #e1e6e2;
  border-radius: 7px;
}

.command-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  grid-template-areas:
    'icon copy'
    '. action';
  min-width: 0;
  align-items: flex-start;
  column-gap: 11px;
  row-gap: 14px;
  padding: 16px;
}

.command-item + .command-item {
  border-left: 1px solid #e1e6e2;
}

.command-icon {
  grid-area: icon;
  flex: none;
  margin-top: 3px;
  color: #247455;
  font-size: 24px;
}

.donate-command .command-icon {
  color: #d94c58;
}

.share-command .command-icon {
  color: #2c7ea8;
}

.gift-command .command-icon {
  color: #7161a8;
}

.command-copy {
  grid-area: copy;
  flex: 1;
  gap: 3px;
}

.command-copy strong,
.command-copy span {
  word-break: normal;
  overflow-wrap: break-word;
}

.command-copy > span {
  color: #718078;
  font-size: 11px;
}

.command-item > button,
.confirm-actions {
  grid-area: action;
  max-width: 100%;
  align-self: center;
  justify-self: start;
}

.command-item > button,
.confirm-actions button,
.command-copy .inline-reward {
  white-space: nowrap;
}

.command-copy .inline-reward {
  overflow: hidden;
}

.confirm-actions {
  grid-column: 1 / -1;
  grid-row: 2;
  width: 100%;
  max-width: 196px;
  flex-direction: row;
  gap: 6px;
  justify-self: center;
}

.confirm-actions button {
  min-width: 0;
  flex: 1;
  padding-right: 8px;
  padding-left: 8px;
}

.confirm-actions .secondary {
  width: 100%;
  border: 1px solid #cdd6d0;
  color: #53635b;
  background: #fff;
}

.progress-section {
  overflow: hidden;
}

.readonly-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.milestone-track {
  display: grid;
  grid-template-columns: repeat(5, minmax(128px, 1fr));
  border-top: 1px solid #e1e6e2;
}

.milestone {
  position: relative;
  min-width: 0;
  padding: 40px 12px 12px;
  text-align: center;
}

.milestone + .milestone {
  border-left: 1px solid #e1e6e2;
}

.milestone::before {
  position: absolute;
  top: 15px;
  right: 50%;
  left: -50%;
  height: 2px;
  content: '';
  background: #dfe5e1;
}

.milestone:first-child::before {
  display: none;
}

.milestone.reached::before {
  background: #48a879;
}

.milestone-dot {
  position: absolute;
  z-index: 1;
  top: 2px;
  left: 50%;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  color: #829087;
  background: #fff;
  box-shadow: 0 0 0 4px #fff;
  transform: translateX(-50%);
}

.milestone-dot > span {
  font-size: 20px;
  line-height: 1;
}

.milestone.reached .milestone-dot {
  border-radius: 50%;
  color: #fff;
  background: #48a879;
}

.milestone.reached .milestone-dot > span {
  font-size: 13px;
}

.milestone-reward {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 6px 0;
  font-size: 11px;
}

.milestone small {
  display: block;
  min-height: 32px;
}

.milestone.reached small {
  color: #17835b;
  font-weight: 700;
}

.milestone.claimed .milestone-dot {
  background: #7e8c84;
}

.milestone-claim {
  width: 100%;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 7px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  background: #247455;
  cursor: pointer;
}

.settlement-band {
  padding: 16px 22px;
  border-left: 4px solid #7161a8;
}

.settlement-band > div:first-child {
  gap: 11px;
}

.settlement-band > div:first-child > span {
  color: #7161a8;
  font-size: 25px;
}

.settlement-band > div:first-child div {
  display: flex;
  flex-direction: column;
}

.settlement-status {
  padding: 6px 9px;
  border-radius: 5px;
  background: #eef1ef;
}

.settlement-status.eligible {
  color: #146e4c;
  background: #e5f5eb;
}

.rules-section {
  padding: 14px 18px;
}

.rules-section summary {
  cursor: pointer;
  font-weight: 700;
}

.rules-section p {
  margin: 10px 0 0;
  color: #53635b;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-line;
}

.empty-state {
  min-height: 360px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: #718078;
}

.empty-state > span {
  font-size: 34px;
}

.empty-state p {
  max-width: 430px;
  margin: 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.7;
}

.empty-state button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  margin-top: 4px;
  padding: 0 15px;
  color: #fff;
  border: 0;
  border-radius: 7px;
  background: #247455;
  cursor: pointer;
  font-weight: 700;
}

.empty-state button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 960px) {
  .overview-band {
    grid-template-columns: 1fr;
  }

  .command-grid {
    grid-template-columns: 1fr;
  }

  .state-grid {
    grid-template-columns: 1fr;
  }

  .command-item + .command-item {
    border-top: 1px solid #e1e6e2;
    border-left: 0;
  }

  .milestone-track {
    overflow-x: auto;
    grid-template-columns: repeat(5, minmax(150px, 1fr));
  }
}

@media (max-width: 620px) {
  .charity-page {
    padding: 14px 10px 44px;
  }

  .overview-band,
  .global-band,
  .activity-state-section,
  .commands-section,
  .progress-section,
  .settlement-band {
    padding: 14px;
  }

  .overview-metrics {
    grid-template-columns: 1fr;
  }

  .command-item,
  .settlement-band,
  .global-detail {
    align-items: stretch;
  }

  .command-item > button,
  .confirm-actions {
    width: 100%;
  }

  .confirm-actions button {
    flex: 1;
  }

  .settlement-band .inline-reward {
    justify-content: flex-start;
  }
}
</style>
