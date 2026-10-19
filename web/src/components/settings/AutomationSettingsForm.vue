<script setup lang="ts">
import type { SettingsState } from '@/stores/setting'
import { NCheckbox, NCheckboxGroup } from 'naive-ui/es/checkbox'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'

export type AutomationSettingsFormModel = Pick<
  SettingsState,
  | 'automation'
  | 'fertilizerBuyOrganicCount'
  | 'fertilizerBuyOrganicThresholdHours'
  | 'fertilizerBuyNormalCount'
  | 'fertilizerBuyNormalThresholdHours'
  | 'fertilizerBuyCheckIntervalMinutes'
  | 'autoAcceptFriendMinLevel'
  | 'autoAcceptRequireOwnLevel'
  | 'autoAcceptHarvestStealEnabled'
  | 'autoAcceptHarvestStealHarvest'
  | 'autoAcceptHarvestStealSteal'
>

defineProps<{
  saving: boolean
  fertilizerLandTypeOptions: Array<{ label: string, value: string }>
  fertilizerOptions: Array<{ label: string, value: string }>
}>()

const emit = defineEmits<{
  save: []
}>()

const settings = defineModel<AutomationSettingsFormModel>({ required: true })

// 奶茶雇佣的三档班次和四个特长取自官方活动配置（MilkTeaHireDurationConfig / MilkTeaTalentConfig），
// 特长 0 表示不限；档价只是配置标价，真正扣多少由服务端当轮报价决定。
const milkTeaHireDurationOptions = [
  { label: '4 小时（档价 40 奶茶券）', value: 1 },
  { label: '12 小时（档价 130 奶茶券）', value: 2 },
  { label: '24 小时（档价 270 奶茶券）', value: 3 },
]

const milkTeaHireTalentOptions = [
  { label: '不限特长（随机雇一位）', value: 0 },
  { label: '金牌销售 · 金币收入 +10%', value: 9001 },
  { label: '金牌宣传 · 热卖值 +10%', value: 9002 },
  { label: '金牌服务 · 售出有概率得宣传喇叭', value: 9003 },
  { label: '默默搬砖 · 热卖值 +5%', value: 9004 },
]
</script>

<template>
  <div class="space-y-4">
    <div class="automation-card-layout">
      <div class="automation-card-column">
        <section class="farm-card rounded-2xl p-4">
          <div class="mb-4 flex items-start gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-900/25 dark:text-green-400">
              <span class="i-carbon-sprout text-xl" />
            </div>
            <div>
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                日常农场
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                管理巡田、种植、任务和产出处理
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.farm" class="automation-setting-item" label="自动种植收获" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.farm_push" class="automation-setting-item" label="推送触发巡田" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.skip_own_weed_bug" class="automation-setting-item" label="巡田时跳过一键务农" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.land_upgrade" class="automation-setting-item" label="自动升级土地" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.task" class="automation-setting-item" label="自动做任务" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.sell" class="automation-setting-item" label="自动卖果实" />
            </div>
            <div class="automation-setting-item sm:col-span-2">
              <BaseSwitch v-model="settings.automation.fertilizer_gift" class="automation-setting-item" label="自动填充化肥" />
            </div>
          </div>
        </section>

        <section class="farm-card rounded-2xl p-4">
          <div class="mb-4 flex items-start gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400">
              <span class="i-carbon-chemistry text-xl" />
            </div>
            <div>
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                施肥管理
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                设置施肥策略、范围和化肥补充
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.fertilizer_buy_organic" class="automation-setting-item" label="自动购买有机化肥" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.fertilizer_buy_normal" class="automation-setting-item" label="自动购买无机化肥" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.fertilizer_multi_season" class="automation-setting-item" label="多季补肥" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.show_manual_fertilizer" class="automation-setting-item" label="显示手动施肥按钮" />
            </div>
          </div>

          <div
            v-if="settings.automation.fertilizer_buy_organic || settings.automation.fertilizer_buy_normal"
            class="mt-3 rounded-lg bg-green-50 p-3 text-sm space-y-3 dark:bg-green-900/20"
          >
            <div v-if="settings.automation.fertilizer_buy_organic" class="space-y-2">
              <div class="text-green-700 font-medium dark:text-green-400">
                有机化肥设置
              </div>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BaseInput v-model.number="settings.fertilizerBuyOrganicCount" label="购买数量" type="number" min="1" max="10000" />
                <BaseInput v-model.number="settings.fertilizerBuyOrganicThresholdHours" label="触发阈值 (小时)" type="number" min="1" max="990" />
              </div>
            </div>
            <div v-if="settings.automation.fertilizer_buy_normal" class="space-y-2">
              <div class="text-green-700 font-medium dark:text-green-400">
                无机化肥设置
              </div>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BaseInput v-model.number="settings.fertilizerBuyNormalCount" label="购买数量" type="number" min="1" max="10000" />
                <BaseInput v-model.number="settings.fertilizerBuyNormalThresholdHours" label="触发阈值 (小时)" type="number" min="1" max="990" />
              </div>
            </div>
            <BaseInput v-model.number="settings.fertilizerBuyCheckIntervalMinutes" label="检测间隔 (分钟)" type="number" min="1" max="1440" />
            <p class="text-xs text-gray-500 dark:text-gray-400">
              系统会按检测间隔检查化肥余量，低于阈值时自动购买。两种化肥同时开启时优先购买有机化肥。
            </p>
          </div>

          <div class="mt-3 border border-amber-200 rounded-lg bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-900/10">
            <div class="mb-2 text-sm text-amber-800 font-medium dark:text-amber-300">
              施肥范围
            </div>
            <NCheckboxGroup v-model:value="settings.automation.fertilizer_land_types">
              <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
                <NCheckbox
                  v-for="option in fertilizerLandTypeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </NCheckbox>
              </div>
            </NCheckboxGroup>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              仅对选中土地类型的地块执行施肥策略。
            </p>
          </div>

          <div class="mt-3 space-y-3">
            <BaseSelect v-model="settings.automation.fertilizer" label="施肥策略" :options="fertilizerOptions" />
            <div
              v-if="settings.automation.fertilizer === 'smart'"
              class="flex flex-wrap gap-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/20"
            >
              <BaseInput
                v-model.number="settings.automation.fertilizer_smart_seconds"
                label="快成熟判定秒数"
                type="number"
                min="30"
                max="3600"
                class="w-40"
              />
              <span class="flex items-end pb-2 text-xs text-gray-500 dark:text-gray-400">
                距离成熟时间 ≤ 此秒数时施有机肥（默认 300 秒）
              </span>
            </div>
          </div>
        </section>
      </div>

      <div class="automation-card-column">
        <section class="farm-card rounded-2xl p-4">
          <div class="mb-4 flex items-start gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-400">
              <span class="i-carbon-user-multiple text-xl" />
            </div>
            <div>
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                好友互动
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                管理好友农场互动和好友申请
              </p>
            </div>
          </div>

          <div class="automation-setting-item">
            <BaseSwitch v-model="settings.automation.friend" class="automation-setting-item" label="自动好友互动" />
          </div>
          <div v-if="settings.automation.friend" class="mt-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <div class="mb-2 text-xs text-blue-700 font-medium dark:text-blue-300">
              互动行为
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.friend_steal" class="automation-setting-item" label="自动偷菜" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.friend_help" class="automation-setting-item" label="自动帮忙" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.friend_bad" class="automation-setting-item" label="自动捣乱" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.friend_help_exp_limit" class="automation-setting-item" label="经验满不帮忙" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.friend_help_protect_dog_ignore_exp_limit" class="automation-setting-item" label="护主犬经验满仍帮忙" />
              </div>
            </div>
          </div>

          <div class="mt-3 rounded-lg bg-blue-50 p-3 space-y-3 dark:bg-blue-900/20">
            <BaseSwitch v-model="settings.automation.friend_auto_accept" class="automation-setting-item" label="自动通过好友申请" />
            <template v-if="settings.automation.friend_auto_accept">
              <div class="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                <BaseInput v-model.number="settings.autoAcceptFriendMinLevel" label="最低等级" type="number" min="0" max="200" />
                <BaseSwitch v-model="settings.autoAcceptRequireOwnLevel" class="automation-setting-item" label="不低于自己等级" />
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                最低等级设为 0 表示不限制固定等级；开启等级条件时需同时满足所有条件。
              </p>
              <div class="flex flex-wrap items-end gap-3">
                <BaseSwitch v-model="settings.autoAcceptHarvestStealEnabled" class="automation-setting-item" label="收偷比过滤" />
                <BaseInput
                  v-model.number="settings.autoAcceptHarvestStealHarvest"
                  label="收获"
                  type="number"
                  min="0"
                  max="9999"
                  class="w-28"
                  :disabled="!settings.autoAcceptHarvestStealEnabled"
                />
                <span class="pb-2 text-xs text-gray-500 dark:text-gray-400">:</span>
                <BaseInput
                  v-model.number="settings.autoAcceptHarvestStealSteal"
                  label="偷菜"
                  type="number"
                  min="1"
                  max="9999"
                  class="w-28"
                  :disabled="!settings.autoAcceptHarvestStealEnabled"
                />
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                默认按 8:1 比较收获/偷菜数量，不合格的申请会直接拒绝。
              </p>
            </template>
          </div>
        </section>

        <section class="farm-card rounded-2xl p-4">
          <div class="mb-4 flex items-start gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400">
              <span class="i-carbon-cafe text-xl" />
            </div>
            <div>
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                奶茶热销中
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                默认全开：前六项只领服务端已经判定「可以领」的收益，后五项会花东西或要上班，雇佣怎么挑人可以在下面改
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_claim_rewards" label="自动领取收银台收益" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_claim_wages" label="自动领取员工工资" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_claim_fund" label="自动领取成长基金档位" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_happy_daily" label="自动领取每日快乐值" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_happy_share" label="自动领取首次分享" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_happy_milestones" label="自动领取快乐档位奖励" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_craft" label="自动制作奶茶（消耗果实）" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_hire" label="自动雇佣员工（花奶茶券）" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_upgrade" label="自动店铺升级（花店内金币）" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_boost" label="自动一键爆单（花宣传喇叭）" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_work_interact" label="自动工作互动·花式摇杯（被雇时）" />
            </div>
          </div>
          <div v-if="settings.automation.milk_tea_hire" class="mt-3 rounded-lg bg-amber-50 p-3 space-y-3 dark:bg-amber-900/20">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BaseSelect
                v-model="settings.automation.milk_tea_hire_duration_id"
                label="雇佣班次"
                :options="milkTeaHireDurationOptions"
              />
              <BaseSelect
                v-model="settings.automation.milk_tea_hire_talent_id"
                label="只雇这个特长"
                :options="milkTeaHireTalentOptions"
              />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.milk_tea_hire_allow_robots" label="把机器人也算进可雇佣候选" />
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              班次越长花奶茶券越多（档价 40／130／270，实际以服务端当轮报价为准，可能含推广奖金），要求的剩余营业时间也更长——选 24 小时档时，剩余营业时间不够一轮就只记跳过。选了特长就只雇这一档的人，当轮没有对应特长的可雇人选时同样只记跳过，不会退回去雇别人。
            </p>
          </div>
          <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            半小时检查一次，一轮里十一项排队执行、项间隔 800ms，不并发。这十一个开关默认是开的，不要哪项就在下面关掉哪项；已经手动关掉的账号不会被重新打开。成长基金只领已达档位，解锁要你在活动页确认付费；没开业的店铺会跳过并记一行日志。
          </p>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            制作按背包顺序取未锁定的有库存果实，整堆提交，每批最多 20 堆、一轮最多 6 批，做完一轮接着做；雇佣取第一个空位，在可雇佣的候选里随机一位（班次、特长、要不要机器人见上面三行）；升级达标即升；爆单按待售杯数决定喇叭用量（向上取整，受持有量和单次上限 9999 约束），没有待售就不花喇叭。这几项都会花你的果实、奶茶券、店内金币、宣传喇叭，确认后再接着开。
          </p>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            工作互动不花任何东西，只在「我被别人雇去当班」时才做，固定选花式摇杯（互动类型 2：老板那一班未来 3 小时的奶茶券收益 +10%，我自己拿本班工资的 30% 作为奖金，这一项在配置里没有失败分支）。这一班没互动过、还没下班、服务端说还有互动次数，三项都满足才会发请求；没被雇、已经下班、次数用完都只按天记一行跳过。另外四种互动（宣传推广、招牌试饮、划水摸鱼、申请涨薪）有赔有赚，仍然由你在「我的工作」页面自己点。
          </p>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            暂不提供自动开关：开业/改名（要店名）、兑换购买（要挑东西，之前那版「自动买种子」已按要求撤掉）、成长基金解锁（要花钻石）、工作互动里花式摇杯之外的另外四项（有赔有赚，要选互动类型）、躺平模式开关（改了会影响好友能否雇你）。这些都得由你拿主意，做成开关只会空转。
          </p>
        </section>

        <section class="farm-card rounded-2xl p-4">
          <div class="mb-4 flex items-start gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400">
              <span class="i-carbon-calendar text-xl" />
            </div>
            <div>
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                节令日历
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                三项都在服务端判定「这一步可做」时才发请求，默认开
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.solar_calendar_claim_events" label="自动领取节令直达奖励" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.solar_calendar_claim_seasons" label="自动领取季度奖励" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.solar_calendar_answer_quiz" label="自动节令答题（仅官方标注过答案的）" />
            </div>
          </div>
          <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            半小时检查一次，三步排队执行、项间隔 800ms，一轮最多领 5 个节令、答 3 题、领 3 个季度，剩下的下一轮接着做；不在开放窗口、或者这一步已经做过，只按天记一行跳过日志，不发写请求。答题排在季度领取之前，这样同一轮里季度就能达标。
          </p>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            答题只提交官方活动配置里标注过 <code>answer_index</code> 的节令（2026-10-19 起：重阳选「A.敬老节」、霜降选「C.最后一个」）。没有标注就一行跳过、绝不动手写请求，因为答错要锁到第二天——那种题请在「节令日历」页面自己点，页面上已经把「正确答案」标出来了。标注的答案若出现在服务端给的错项记录里，也当标注不可信、跳过。
          </p>
        </section>

        <section class="farm-card rounded-2xl p-4">
          <div class="mb-4 flex items-start gap-3">
            <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-900/25 dark:text-violet-400">
              <span class="i-carbon-store text-xl" />
            </div>
            <div>
              <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
                神秘商人
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                自动购买商品并接收相关提醒
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.mystery_shop_auto_buy" class="automation-setting-item" label="自动购买" />
            </div>
            <div class="automation-setting-item">
              <BaseSwitch v-model="settings.automation.mystery_shop_arrival_notify" class="automation-setting-item" label="到货提醒" />
            </div>
            <div class="automation-setting-item sm:col-span-2">
              <BaseSwitch
                v-model="settings.automation.mystery_shop_purchase_notify"
                class="automation-setting-item"
                label="购买提醒"
                :disabled="!settings.automation.mystery_shop_auto_buy"
              />
            </div>
          </div>

          <div v-if="settings.automation.mystery_shop_auto_buy" class="mt-3 rounded-lg bg-gray-50 p-3 space-y-3 dark:bg-gray-800/60">
            <div class="text-sm text-gray-800 font-medium dark:text-gray-200">
              允许使用的货币
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.mystery_shop_allow_gold" class="automation-setting-item" label="金币" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.mystery_shop_allow_coupon" class="automation-setting-item" label="点券" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.mystery_shop_allow_gold_bean" class="automation-setting-item" label="金豆豆" />
              </div>
              <div class="automation-setting-item">
                <BaseSwitch v-model="settings.automation.mystery_shop_allow_diamond" class="automation-setting-item" label="钻石" />
              </div>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              自动购买会先按标价币种筛选，再检查余额是否足够；提醒使用「用户设置 → 下线提醒」的推送渠道。
            </p>
          </div>
          <p v-else class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            到货提醒可单独开启；购买提醒需先打开自动购买。
          </p>
        </section>
      </div>
    </div>

    <div class="flex justify-end gap-2 border-t pt-3 dark:border-gray-700">
      <BaseButton variant="primary" size="sm" :loading="saving" @click="emit('save')">
        保存自动控制
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.automation-setting-item {
  display: flex;
  min-height: 42px;
  align-items: center;
  padding: 9px 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-control);
  background: color-mix(in srgb, var(--ui-surface-strong) 58%, transparent);
}

.automation-card-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 1rem;
}

.automation-card-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
}

.automation-setting-item {
  display: flex;
  min-height: 42px;
  align-items: center;
  padding: 9px 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-control);
  background: color-mix(in srgb, var(--ui-surface-strong) 58%, transparent);
}

@media (max-width: 1279px) {
  .automation-card-layout {
    display: block;
  }

  .automation-card-column {
    display: contents;
  }

  .automation-card-layout section {
    margin-bottom: 1rem;
  }
}
</style>
