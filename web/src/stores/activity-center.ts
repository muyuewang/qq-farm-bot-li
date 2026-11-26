import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/api'

export type ActivityTabKey = 'travel' | 'constellation' | 'shop' | 'solar' | 'qixi' | 'qingmei' | 'charity' | 'weather' | 'pet' | 'wish' | 'happy' | 'milk' | 'muge' | 'yishuhuanfu'
export type ActivityGameplayKey = 'stellar' | 'qixi' | 'qingmei' | 'charity' | 'weather' | 'pet' | 'wish' | 'happy' | 'milk' | 'muge' | 'yishuhuanfu'
export type ActivityVariant = 'blue' | 'violet' | 'gold' | 'green'
export type ActivityRecord = Record<string, unknown>

export const WEATHER_SCAN_BATCH_SIZE = 5

export interface ActivityDirectoryItemDto {
  id: string
  activityIds: string[]
  name: string
  startTime: number | null
  endTime: number | null
  instanceId?: string | null
  gameplayKey: ActivityGameplayKey | null
  gameplayTargets: ActivityTabKey[]
  detailTarget: ActivityTabKey | null
}

export interface ActivityItemDto {
  id: string
  name: string
  count: string
  image: string
  rarity: string | number | null
}

export interface ActivityRewardDto extends ActivityItemDto {
  locked: boolean
  claimed: boolean
}

export interface ActivityRulesDto {
  title: string
  paragraphs: string[]
  lines?: string[]
}

export interface PassNodeDto {
  id: string
  level: string
  statusCode: string
  keyLevel: boolean
  locked: boolean
  claimed: boolean
  claimable: boolean
  current: boolean
  rewards: ActivityRewardDto[]
}

export interface TravelPassDto {
  activityId: string
  title: string
  description: string
  level: string | null
  progress: number | null
  progressMax: number | null
  claimedThroughLevel: string | null
  rules: ActivityRulesDto
  nodes: PassNodeDto[]
}

export interface ConstellationLinkDto {
  from: string
  to: string
}

export interface ConstellationNodeDto {
  id: string
  name: string
  description: string
  statusCode: string
  x: number | null
  y: number | null
  locked: boolean
  lit: boolean
  lightable: boolean
  current: boolean
  rewards: ActivityRewardDto[]
}

export type ConstellationVisualState = 'lit' | 'lightable' | 'claimableUnknown' | 'locked' | 'unknown'

export interface ConstellationGroupDto {
  id: string
  nodeId: string
  name: string
  category: string
  explain: string
  order: number | null
  chartIndex: number | null
  visualState: ConstellationVisualState
  opened: boolean | null
  lit: boolean | null
  stateKnown: boolean
  statusSource: string
  claimStatus: string
  nodeIds: string[]
  linksRaw: string
  rewards: ActivityRewardDto[]
  // Compatibility view for the current constellation component. Coordinates remain null
  // until an authoritative chart layout is supplied by the backend/catalog.
  current: boolean
  nodes: ConstellationNodeDto[]
  links: ConstellationLinkDto[]
}

export interface ConstellationDto {
  activityId: string
  typeCode: string
  displayName: string
  title: string
  serverName: string
  description: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  catalogStatus: string
  rules: ActivityRulesDto
  currentDay: number | null
  groups: ConstellationGroupDto[]
}

export interface SeasonDto {
  id: string
  title: string
  description: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  pass: TravelPassDto | null
}

export interface ShopCategoryDto {
  id: string
  name: string
}

export interface ShopGoodsDto {
  id: string
  name: string
  description: string
  categoryId: string
  categoryName: string
  item: ActivityItemDto
  cost: ActivityItemDto
  statusCode: string
  owned: boolean
  exchangeable: boolean
  soldOut: boolean
  balanceKnown: boolean
  maxExchangeCount: string
  maxExchangeCountKnown: boolean
}

export interface ShopCurrencyDto extends ActivityItemDto {
  balance: string | null
  balanceKnown: boolean
}

export interface ShopDto {
  activityId: string
  name: string
  title: string
  description: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  balance: string | null
  balanceKnown: boolean
  currency: ActivityItemDto
  currencies: ShopCurrencyDto[]
  categories: ShopCategoryDto[]
  goods: ShopGoodsDto[]
  action: ActivityActionDto
}

export interface SolarTermDto {
  id: string
  name: string
  title: string
  englishName: string
  description: string
  rewardTitle: string
  rewardDescription: string
  statusCode: string
  startTime: number | null
  endTime: number | null
  current: boolean
  locked: boolean
  claimed: boolean
  claimable: boolean
  rewards: ActivityRewardDto[]
}

export interface SolarTermsDto {
  title: string
  description: string
  rewardTitle: string
  rewardDescription: string
  serverTime: number | null
  currentTermId: string
  terms: SolarTermDto[]
}

export interface ActivityActionDto {
  enabled: boolean
  available: boolean
  attemptable?: boolean
  attemptableCount?: number | null
  availabilityKnown: boolean
  count: number | null
}

export interface ActivityActionsDto {
  claimPass: ActivityActionDto
  lightConstellation: ActivityActionDto
  claimSolar: ActivityActionDto
  exchange: ActivityActionDto
  qixiBridge: ActivityActionDto
  qixiGift: ActivityActionDto
  qixiDew: ActivityActionDto
  charityClaimSeeds: ActivityActionDto
  charityDonateLove: ActivityActionDto
  charityClaimDailyGift: ActivityActionDto
  weatherResearch?: ActivityActionDto
}

export interface WeatherResearchNodeDto {
  id: string
  prerequisites: string[]
  status: string
  opened: boolean
  claimed: boolean
  claimable: boolean
  current: boolean
  featured: boolean
  extra: string
  cost: ActivityItemDto
  reward: ActivityItemDto
}

export interface WeatherStatusDto {
  hostGid: string
  type: number
  status: number
  beginTime: number | null
  endTime: number | null
  source: number
  field8: number
  friendMarker: number
  collectedThisCycle: boolean
  active: boolean
  isThunderstorm: boolean
  remainingSec: number
  durationSec: number
}

export interface WeatherFriendDto {
  gid: string
  name: string
  avatarUrl: string
  level: number
  inspected: boolean
  inspectedAt: number | null
  scanError: string
  availability: 'unknown' | 'available' | 'collected' | 'expired' | 'unavailable'
  availabilityReason: string
  canCollect: boolean
  eligibleCloudLandIds: string[]
  weather: WeatherStatusDto
}

export interface WeatherCommandDto {
  enabled: boolean
  reason: string
  batchSize: number
  friendCount: number
  nodeId: string
  dailyLimit: number
}

export interface WeatherActivityDto {
  groupId: string
  activityId: string
  catalogActivityId: string
  taskActivityId: string
  researchActivityId: string
  name: string
  title: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  active: boolean
  rules: ActivityRulesDto
  badge: ActivityItemDto
  balances: { badge: string | null, collectionBottle: string | null, rainBottle: string | null, known: boolean }
  inventory: {
    known: boolean
    collectionBottle: ActivityItemDto
    rainBottle: ActivityItemDto
    lightningMutationBottle: ActivityItemDto
    lightningAttractBottle: ActivityItemDto
    frogBottle: ActivityItemDto
    darkCloudBottle: ActivityItemDto
    lightningSense: ActivityItemDto & { effectPerItemPercent?: number, effectPercent?: number, passive?: boolean, active?: boolean }
  }
  // The upstream layout calls these id/type. For the capture-verified local DTO,
  // id is WeatherStatus.weather_type (field 1) and type is status (field 2).
  weather: { id: string, type: string, typeName: string | null, statusName: string, beginTime: number | null, endTime: number | null, active: boolean } | null
  friends: WeatherFriendDto[]
  catalog: Array<{ id: string, item: ActivityItemDto, cost: ActivityItemDto, status: string, name: string }>
  progress: { taskId: string, current: string, target: string, item: ActivityItemDto, reward: ActivityItemDto, rewardStatus: string, status: string, active: boolean }
  tasks: Array<{ id: string, itemId: string, name: string, target: string, reward: ActivityItemDto, current: string, active: boolean }>
  research: WeatherResearchNodeDto[]
  actions: { research: ActivityActionDto, scanFriendWeather: WeatherCommandDto }
}

export interface QixiBridgeStageDto {
  id: string
  stage: number
  statusCode: string
  completed: boolean
  claimed: boolean
  claimable: boolean
  current: boolean
  cost: ActivityItemDto
  rewards: ActivityItemDto[]
}

export interface QixiGiftExchangeDto {
  costItems: ActivityItemDto[]
  receiveItems: ActivityItemDto[]
  giftType: string
  content: string
}

export interface QixiDewDto extends ActivityItemDto {
  balance: string | null
  balanceKnown: boolean
  usable: boolean
  sellable: boolean
  sellStatus: string
  sellCondition: string
  sellPrice: {
    currencyId: string
    amount: string
    currencyName: string
    currencyImage: string
  } | null
}

export interface QixiActivityDto {
  groupId: string
  activityId: string
  bridgeActivityId: string
  giftActivityId: string
  name: string
  title: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  active: boolean
  rules: ActivityRulesDto
  feather: ActivityItemDto
  sachet: ActivityItemDto
  receivedSachet: ActivityItemDto
  dew: QixiDewDto
  balances: {
    feather: string | null
    sachet: string | null
    receivedSachet: string | null
    dew: string | null
    known: boolean
  }
  bridge: {
    currentStage: number
    stages: QixiBridgeStageDto[]
    claimable: boolean
    rewardRedDot: boolean
    displayItems: ActivityItemDto[]
  }
  gift: {
    sentCount: string
    sendLimit: string
    receiveLimit: string
    exchanges: QixiGiftExchangeDto[]
    messageTextId: string
  }
  actions: {
    bridge: ActivityActionDto
    gift: ActivityActionDto
    dew: ActivityActionDto
  }
}

export interface QingMeiQuoteDto {
  round: number
  unitPrice: string
  totalGold: string
  doubled: boolean
}

export interface QingMeiIngredientDto extends ActivityItemDto {
  uid: string
  key: string
  mutantTypes: string[]
  mutantTypeNames: string[]
}

export interface YishuHuanfuCatalogEntryDto {
  index: number
  itemId: string | null
  name: string
  nameKnown: boolean
  price: string
  status: number
  limit: string
  // 兑换后服务端补的今日已兑次数（field 5），仅作展示参考。
  exchangedToday: string
  image: string
  exchangeable: boolean
}

export interface YishuHuanfuFriendShopDto {
  gid: string
  name: string
  avatar: string
  level: string
  own: boolean
  // price 是基础价，bonus 是加成，游戏界面显示的“今日蜜薯收购价”是两者之和 totalPrice。
  price: string
  bonus: string
  totalPrice: string
  quota: string
  quotaCap: string
  quotaUsed: string
  // cmd 92 的 can_sell：true 收薯 / false 明确不收 / null 回包没带该字段（按可卖处理）。
  canSell: boolean | null
  // 自家铺子不占好友额度，界面显示「不限」而不是「还可收 N 个」。
  unlimited: boolean
  // 候选来源：本账号好友 / 面板里其它账号的好友 / 自己。其它账号好友也可能收蜜薯。
  via: 'own' | 'friend' | 'panel'
  panelAccount: string
}

/**
 * 一条收购记录（cmd 95）。好友把蜜薯卖进你的铺子后产生：
 * total 是付给卖家的福气币总额，commission 是你拿到的提成。
 */
export interface YishuHuanfuRecordDto {
  timestamp: string
  gid: string
  count: string
  total: string
  name: string
  avatar: string
  level: string
  commission: string
}

export interface YishuHuanfuFriendScanDto {
  shops: YishuHuanfuFriendShopDto[]
  best: YishuHuanfuFriendShopDto | null
  ownShop: YishuHuanfuFriendShopDto | null
  scanned: number
  failed: number
  friendCount: number
  panelFriendCount: number
  candidateCount: number
  pendingCount: number
  friendListError: string
  scannedAt: number
  cached: boolean
}

export interface YishuHuanfuActivityDto {
  groupId: string
  activityId: string
  name: string
  startTime: number | null
  endTime: number | null
  rules: ActivityRulesDto
  active: boolean
  serverTime: string
  shop: {
    gid: string
    price: string
    priceKnown: boolean
    quoteTime: string
    selfPrice: string
    // 分享暴击加成，展示用：预计成交价 = price + bonus，实际以出售回包为准。
    bonus: string
    estimatedPrice: string | null
    // 剩余接收额度只能靠 cmd 92 现查，快照里为 null。
    quota: string | null
    quotaCap: string
    quotaUsed: string | null
  }
  seed: ActivityItemDto
  seedBalance: string | null
  seedBalanceKnown: boolean
  sweetPotato: ActivityItemDto
  sweetPotatoBalance: string | null
  sweetPotatoBalanceKnown: boolean
  luckCoin: ActivityItemDto
  luckCoinBalance: string | null
  luckCoinBalanceKnown: boolean
  catalog: YishuHuanfuCatalogEntryDto[]
  catalogLoaded: boolean
  // 收购提成：好友把蜜薯卖进你的铺子后按比例产生。pending 为待领取数量。
  commission: { pending: string, claimable: boolean, flag: string }
  // 背包读取失败的原因；非空而余额又未知时，前端要把原因显示出来而不是只写 “--”。
  balanceError: string
  // true 表示这次没读到背包，当前数字是上一次成功值（可继续展示，不报错）。
  balanceStale: boolean
  daily: { dateKey: string, seedClaimed: boolean, shared: boolean, sharedToday: boolean }
  actions: {
    claimSeed: ActivityActionDto
    sell: ActivityActionDto
    share: ActivityActionDto
    exchange: ActivityActionDto & { reason: string }
  }
}

export interface QingMeiActivityDto {
  activityId: string
  dailyActivityId: string
  name: string
  title: string
  startTime: number | null
  endTime: number | null
  rules: ActivityRulesDto
  ingredient: ActivityItemDto
  ingredients: QingMeiIngredientDto[]
  balance: string | null
  balanceKnown: boolean
  baseGold: string
  basePrice: string
  guaranteedPrice: string
  currentRound: number
  started: boolean
  maxRounds: number
  finished: boolean
  quotePrices: string[]
  quoteTotals: string[]
  quote: QingMeiQuoteDto | null
  dailySeed: { claimed: boolean, grantId: string, reward: ActivityItemDto } | null
  actions: {
    claimSeed: ActivityActionDto
    start: ActivityActionDto
    continue: ActivityActionDto
    settle: ActivityActionDto
  }
}

export interface CharityProgressRewardDto {
  target: string
  reward: ActivityItemDto
  statusCode: string
  reached: boolean
  claimed: boolean
  claimable: boolean
  claimSupported: boolean
}

export interface CharityRedFlowerActivityDto {
  groupId: string
  activityId: string
  name: string
  title: string
  startTime: number | null
  endTime: number | null
  serverTime: number | null
  active: boolean
  rules: ActivityRulesDto
  love: ActivityItemDto
  loveBalance: string
  donatedLove: string
  flowStatus: string
  agreementStatus: string
  seedReward: { statusCode: string, claimable: boolean, claimed: boolean, reward: ActivityItemDto }
  dailyGift: {
    statusCode: string
    claimed: boolean
    harvestedToday: boolean
    reward: ActivityItemDto
    publicFund: { date: string, statusCode: string } | null
  }
  progressRewards: CharityProgressRewardDto[]
  globalProgress: { donated: string, target: string, reached: boolean, rewardTarget: string, reward: ActivityItemDto }
  settlement: {
    requiredLove: string
    eligible: boolean
    globalReached: boolean
    personalReached: boolean
    reward: ActivityItemDto
  }
  actions: {
    claimSeeds: ActivityActionDto
    donateLove: ActivityActionDto
    claimDailyGift: ActivityActionDto
  }
}

export interface ActivityCenterSnapshotDto {
  serverTime: number | null
  activities: ActivityDirectoryItemDto[]
  season: SeasonDto | null
  shop: ShopDto | null
  solarTerms: SolarTermsDto | null
  constellation: ConstellationDto | null
  qixi: QixiActivityDto | null
  qingMei: QingMeiActivityDto | null
  charity: CharityRedFlowerActivityDto | null
  weather: WeatherActivityDto | null
  yishuHuanfu: YishuHuanfuActivityDto | null
  actions: ActivityActionsDto
}

export type ActivityMutationKey = 'claimPass' | 'lightConstellation' | 'claimSolar' | 'exchange' | 'claimQixiBridge' | 'giftQixiSachet' | 'claimQingMeiSeed' | 'startQingMeiBrew' | 'continueQingMeiBrew' | 'settleQingMeiBrew' | 'claimCharitySeeds' | 'donateCharityLove' | 'claimCharityDailyGift' | 'claimCharityProgress' | 'lightWeatherResearch' | 'buyWeatherBottle' | 'scanWeatherFriends' | 'collectWeatherBottle' | 'summonWeatherRain' | 'claimYishuHuanfuSeed' | 'sellYishuHuanfuSweetPotato' | 'shareYishuHuanfuShop' | 'exchangeYishuHuanfuGoods' | 'refreshYishuHuanfuQuote' | 'claimYishuHuanfuCommission'

function isRecord(value: unknown): value is ActivityRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown): ActivityRecord {
  return isRecord(value) ? value : {}
}

function records(value: unknown): ActivityRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function first(...values: unknown[]): unknown {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function text(...values: unknown[]): string {
  const value = first(...values)
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function bool(...values: unknown[]): boolean {
  const value = first(...values)
  if (typeof value === 'string')
    return ['1', 'true', 'yes'].includes(value.toLowerCase())
  return value === true || value === 1
}

function finiteNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined)
    return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toMilliseconds(value: unknown): number | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 1e12 ? value * 1000 : value
    return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      const milliseconds = numeric < 1e12 ? numeric * 1000 : numeric
      return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null
    }
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function plainText(value: unknown): string {
  return text(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '\'')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .trim()
}

function descriptionOf(raw: ActivityRecord): string {
  const rules = record(first(raw.rules, raw.rule, raw.content))
  const paragraphs = Array.isArray(rules.paragraphs) && rules.paragraphs.length ? rules.paragraphs : first(rules.lines, raw.paragraphs, raw.lines)
  return plainText(first(raw.description, raw.subtitle, raw.explain, Array.isArray(paragraphs) ? paragraphs.filter(Boolean).map(plainText).join('\n') : '', rules.title))
}

function normalizeRules(value: unknown): ActivityRulesDto {
  const raw = record(value)
  const entries = Array.isArray(raw.paragraphs) && raw.paragraphs.length
    ? raw.paragraphs
    : Array.isArray(raw.lines) ? raw.lines : []
  const paragraphs = entries
    .filter((entry): entry is string | number => typeof entry === 'string' || typeof entry === 'number')
    .map(plainText)
    .filter(Boolean)
  return {
    title: plainText(raw.title),
    paragraphs,
    lines: [...paragraphs],
  }
}

function normalizeItem(value: unknown): ActivityItemDto {
  const raw = record(value)
  return {
    id: text(raw.id, raw.itemId, raw.item_id),
    name: text(raw.name, raw.itemName, raw.item_name, raw.title),
    count: text(raw.count, raw.quantity, raw.num, raw.amount),
    image: text(raw.image, raw.imageUrl),
    rarity: first(raw.rarity, raw.quality, raw.qualityCode) as string | number | null ?? null,
  }
}

function normalizeReward(value: unknown, inheritedLocked = false): ActivityRewardDto {
  const raw = record(value)
  const item = normalizeItem(isRecord(raw.item) ? { ...raw, ...raw.item } : raw)
  return {
    ...item,
    locked: inheritedLocked || bool(raw.locked, raw.isLocked),
    claimed: bool(raw.claimed, raw.received, raw.isClaimed),
  }
}

function statusIs(status: string, ...candidates: string[]): boolean {
  return candidates.includes(status.toLowerCase())
}

function normalizePass(value: unknown, seasonRaw: ActivityRecord): TravelPassDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const nodeValues = records(first(raw.nodes, raw.levels, raw.rewards, seasonRaw.rewards))
  const levelValue = first(raw.level, raw.currentLevel, raw.current_level, raw.field2Code, seasonRaw.level)
  const claimedThroughValue = first(raw.claimedThroughLevel, raw.claimed_through_level, raw.field9Code)
  const rules = normalizeRules(first(raw.rules, raw.rule, raw.content))
  return {
    activityId: text(raw.activityId, raw.activity_id, seasonRaw.activityId),
    title: text(raw.title, raw.name),
    description: descriptionOf(raw),
    level: levelValue === undefined || levelValue === null || levelValue === '' ? null : String(levelValue),
    progress: finiteNumber(first(raw.progress, raw.currentProgress, raw.current_progress, raw.points, raw.score, seasonRaw.progress)),
    progressMax: finiteNumber(first(raw.progressMax, raw.progressTarget, raw.progress_target, raw.progress_max, raw.target, raw.nextLevelProgress, seasonRaw.progressMax)),
    claimedThroughLevel: claimedThroughValue === undefined || claimedThroughValue === null || claimedThroughValue === '' ? null : String(claimedThroughValue),
    rules,
    nodes: nodeValues.map((node, index) => {
      const statusCode = text(node.statusCode, node.status, node.state)
      const claimed = bool(node.claimed, node.received, node.isClaimed) || statusIs(statusCode, '3', 'claimed', 'received')
      const explicitClaimable = bool(node.claimable, node.canClaim, node.available) || statusIs(statusCode, '2', 'claimable', 'available')
      const lockedValue = first(node.locked, node.isLocked)
      const locked = lockedValue === undefined || lockedValue === null || lockedValue === ''
        ? !claimed && !explicitClaimable
        : bool(lockedValue)
      return {
        id: text(node.id, node.nodeId, node.node_id, index),
        level: text(node.level, node.levelNo, node.level_no),
        statusCode,
        keyLevel: bool(node.keyLevel, node.key_level, node.isKeyLevel, node.is_key_level),
        locked,
        claimed,
        claimable: explicitClaimable && !claimed && !locked,
        current: bool(node.current, node.active, node.isCurrent),
        rewards: records(first(node.rewards, node.items, node.rewardList)).map(reward => normalizeReward(reward, locked)),
      }
    }),
  }
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || (typeof value === 'string' && ['1', 'true', 'yes'].includes(value.toLowerCase())))
    return true
  if (value === false || value === 0 || (typeof value === 'string' && ['0', 'false', 'no'].includes(value.toLowerCase())))
    return false
  return null
}

function constellationVisualState(value: unknown, opened: boolean | null, lit: boolean | null): ConstellationVisualState {
  if (value === 'lit' || value === 'lightable' || value === 'claimableUnknown' || value === 'locked' || value === 'unknown')
    return value
  // Compatibility for snapshots which expose the explicit booleans but not visualState.
  if (lit === true)
    return 'lit'
  if (opened === true)
    return 'lightable'
  if (opened === false)
    return 'locked'
  return 'unknown'
}

function normalizeConstellation(value: unknown): ConstellationDto | null {
  if (!isRecord(value))
    return null
  const raw = record(first(value.constellation, value.state, value))
  const activity = record(first(value.activity, value.activityInfo, value.activity_info))
  const rules = normalizeRules(first(raw.rules, value.rules))
  const currentDay = finiteNumber(first(raw.currentDay, raw.current_day))

  return {
    activityId: text(raw.activityId, raw.activity_id, value.activityId, value.activity_id, activity.id, activity.activityId),
    typeCode: text(raw.typeCode, raw.type_code, value.typeCode, activity.typeCode, activity.type),
    displayName: '观星礼录',
    title: '观星礼录',
    serverName: text(raw.serverName, raw.server_name, value.serverName, activity.name),
    description: rules.paragraphs.join('\n'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time, value.startTime, activity.startTime, activity.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time, value.endTime, activity.endTime, activity.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time, value.serverTime, value.server_time)),
    catalogStatus: text(raw.catalogStatus, raw.catalog_status),
    rules,
    currentDay,
    groups: records(first(raw.groups, value.groups)).map((group, groupIndex) => {
      const id = text(group.id, group.groupId, group.group_id, groupIndex + 1)
      const nodeId = text(group.nodeId, group.node_id, id)
      const order = finiteNumber(first(group.order, groupIndex + 1))
      const chartIndex = finiteNumber(first(group.chartIndex, group.chart_index))
      const opened = nullableBoolean(first(group.opened, group.isOpened, group.is_opened))
      const lit = nullableBoolean(first(group.lit, group.isLit, group.is_lit))
      const visualState = constellationVisualState(group.visualState, opened, lit)
      const stateKnownValue = nullableBoolean(first(group.stateKnown, group.state_known))
      const stateKnown = stateKnownValue ?? false
      const name = plainText(first(group.name, group.title))
      const explain = plainText(first(group.explain, group.description, group.subtitle))
      const rewards = records(first(group.rewards, group.items, group.rewardList)).map(reward => normalizeReward(reward))
      const current = currentDay !== null && order === currentDay
      const nodeIds = Array.isArray(group.nodeIds)
        ? group.nodeIds.map(nodeId => text(nodeId)).filter(Boolean)
        : []
      const compatibilityNode: ConstellationNodeDto = {
        id: nodeId,
        name,
        description: explain,
        statusCode: visualState,
        x: null,
        y: null,
        locked: visualState === 'locked',
        lit: lit === true,
        lightable: visualState === 'lightable',
        current,
        rewards,
      }
      return {
        id,
        nodeId,
        name,
        category: plainText(group.category),
        explain,
        order,
        chartIndex,
        visualState,
        opened,
        lit,
        stateKnown,
        statusSource: text(group.statusSource, group.status_source),
        claimStatus: text(group.claimStatus, group.claim_status),
        nodeIds,
        linksRaw: text(group.linksRaw, group.links_raw),
        rewards,
        current,
        nodes: [compatibilityNode],
        links: [],
      }
    }),
  }
}

function normalizeSeason(value: unknown): SeasonDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  return {
    id: text(raw.id, raw.seasonId, raw.season_id),
    title: text(raw.title, raw.name),
    description: descriptionOf(raw),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time, raw.beginTime, raw.begin_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    pass: normalizePass(first(raw.pass, raw.travelPass, raw.travel_pass), raw),
  }
}

function normalizeShop(value: unknown): ShopDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const goodsValues = records(first(raw.goods, raw.items, raw.products, raw.list))
  const rawCurrencies = records(raw.currencies)
  const currencyRaw = record(first(raw.currencyItem, raw.currency_item, raw.balanceItem, raw.balance_item, rawCurrencies[0], isRecord(raw.currency) ? raw.currency : null))
  const firstCost = record(goodsValues[0]?.cost)
  const currency = normalizeItem(Object.keys(currencyRaw).length ? currencyRaw : firstCost)
  const explicitBalanceKnown = nullableBoolean(first(raw.balanceKnown, raw.balance_known))
  const currencies = rawCurrencies.map((entry) => {
    const balanceValue = first(entry.balance, entry.count)
    const knownValue = nullableBoolean(first(entry.balanceKnown, entry.balance_known))
    const balanceKnown = knownValue ?? (balanceValue !== undefined && balanceValue !== null && balanceValue !== '')
    return {
      ...normalizeItem(entry),
      balance: balanceKnown ? text(balanceValue) : null,
      balanceKnown,
    }
  })
  const fallbackBalance = first(raw.balance, currencyRaw.balance, !isRecord(raw.currency) ? raw.currency : undefined)
  const balanceKnown = explicitBalanceKnown ?? currencies[0]?.balanceKnown ?? (fallbackBalance !== undefined && fallbackBalance !== null && fallbackBalance !== '')
  const balance = balanceKnown ? text(currencies[0]?.balance, fallbackBalance, currencyRaw.count) : null
  const explicitCategories = Array.isArray(raw.categories) ? raw.categories : []
  const categories = explicitCategories.map((entry, index) => {
    const category = record(entry)
    return typeof entry === 'string'
      ? { id: entry, name: entry }
      : { id: text(category.id, category.categoryId, category.value, index), name: text(category.name, category.title, category.label) }
  }).filter(category => category.name)
  const goods = goodsValues.map((entry) => {
    const itemSource = isRecord(entry.item) ? entry.item : entry
    const costSource = isRecord(entry.cost) ? entry.cost : record(first(entry.priceItem, entry.price_item))
    const statusCode = text(entry.statusCode, entry.status_code, entry.status, entry.state)
    const goodsBalanceKnown = nullableBoolean(first(entry.balanceKnown, entry.balance_known)) ?? balanceKnown
    const maxExchangeCountValue = first(entry.maxExchangeCount, entry.max_exchange_count)
    const maxExchangeCountKnown = nullableBoolean(first(entry.maxExchangeCountKnown, entry.max_exchange_count_known))
      ?? (maxExchangeCountValue !== undefined && maxExchangeCountValue !== null && maxExchangeCountValue !== '')
    return {
      id: text(entry.id, entry.goodsId, entry.goods_id),
      name: text(entry.name, entry.title, entry.goodsName),
      description: descriptionOf(entry),
      categoryId: text(entry.categoryId, entry.category_id, entry.type, entry.category),
      categoryName: text(entry.categoryName, entry.category, entry.typeName),
      item: normalizeItem(itemSource),
      cost: normalizeItem({ ...costSource, count: first(costSource.count, entry.price, entry.needCount, entry.costCount) }),
      statusCode,
      owned: bool(entry.owned, entry.isOwned, entry.is_owned),
      exchangeable: bool(entry.exchangeable, entry.canExchange, entry.can_exchange),
      soldOut: bool(entry.soldOut, entry.sold_out, entry.disabled) || statusCode.toLowerCase() === 'soldout',
      balanceKnown: goodsBalanceKnown,
      maxExchangeCount: text(maxExchangeCountValue),
      maxExchangeCountKnown,
    }
  })
  for (const item of goods) {
    const categoryName = item.categoryName
    if (categoryName && !categories.some(category => category.name === categoryName || category.id === item.categoryId))
      categories.push({ id: item.categoryId || categoryName, name: categoryName })
  }
  const name = text(raw.name, raw.title)
  return {
    activityId: text(raw.activityId, raw.activity_id, raw.id),
    name,
    title: text(raw.title, name),
    description: descriptionOf(raw),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time, raw.beginTime, raw.begin_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    balance,
    balanceKnown,
    currency,
    currencies,
    categories,
    goods,
    action: normalizeAction({ exchange: raw.action }, {}, ['exchange']),
  }
}

function normalizeSolarTerms(value: unknown): SolarTermsDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const currentTermId = text(raw.currentTermId, raw.current_term_id)
  return {
    title: text(raw.title, raw.name),
    description: descriptionOf(raw),
    rewardTitle: text(raw.rewardTitle, raw.reward_title),
    rewardDescription: text(raw.rewardDescription, raw.reward_description),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    currentTermId,
    terms: records(first(raw.terms, raw.items, raw.solarTerms, raw.solar_terms)).map((term) => {
      const statusCode = text(term.statusCode, term.status, term.state)
      const claimed = bool(term.claimed, term.received, term.isClaimed) || statusIs(statusCode, '3', 'claimed', 'received')
      const claimable = bool(term.claimable, term.canClaim, term.available) || statusCode === '2'
      return {
        id: text(term.id, term.termId, term.term_id),
        name: text(term.name, term.shortName),
        title: text(term.title, term.name),
        englishName: text(term.englishName, term.english_name, term.english),
        description: descriptionOf(term),
        rewardTitle: text(term.rewardTitle, term.reward_title),
        rewardDescription: text(term.rewardDescription, term.reward_description),
        statusCode,
        startTime: toMilliseconds(first(term.startTime, term.start_time, term.beginTime, term.begin_time)),
        endTime: toMilliseconds(first(term.endTime, term.end_time)),
        current: bool(term.current, term.active, term.isCurrent) || (!!currentTermId && text(term.id, term.termId, term.term_id) === currentTermId),
        locked: bool(term.locked, term.isLocked) || statusIs(statusCode, '0', 'locked'),
        claimed,
        claimable: claimable && !claimed,
        rewards: records(first(term.rewards, term.items, term.rewardList)).map(reward => normalizeReward(reward)),
      }
    }),
  }
}

export function normalizeActivityDirectory(value: unknown): ActivityDirectoryItemDto[] {
  return records(value).map((entry) => {
    const detailTarget = text(entry.detailTarget, entry.detail_target)
    const normalizedDetailTarget = ['travel', 'constellation', 'shop', 'solar', 'qixi', 'qingmei', 'charity', 'weather', 'pet', 'wish', 'happy', 'milk', 'muge', 'yishuhuanfu'].includes(detailTarget)
      ? detailTarget as ActivityTabKey
      : null
    const gameplayKey = text(entry.gameplayKey, entry.gameplay_key)
    const rawGameplayTargets = first(entry.gameplayTargets, entry.gameplay_targets)
    const gameplayTargets = Array.isArray(rawGameplayTargets)
      ? rawGameplayTargets.map(value => text(value)).filter((value): value is ActivityTabKey => ['travel', 'constellation', 'shop', 'solar', 'qixi', 'qingmei', 'charity', 'weather', 'pet', 'wish', 'happy', 'milk', 'muge', 'yishuhuanfu'].includes(value))
      : []
    const id = text(entry.id, entry.activityId, entry.activity_id)
    const rawActivityIds = first(entry.activityIds, entry.activity_ids)
    const activityIds = Array.isArray(rawActivityIds)
      ? rawActivityIds.map(value => text(value)).filter(Boolean)
      : []
    return {
      id,
      activityIds: activityIds.length > 0 ? activityIds : [id].filter(Boolean),
      name: text(entry.name, entry.title),
      startTime: toMilliseconds(first(entry.startTime, entry.start_time, entry.beginTime, entry.begin_time)),
      endTime: toMilliseconds(first(entry.endTime, entry.end_time)),
      instanceId: text(entry.instanceId, entry.instance_id) || null,
      gameplayKey: gameplayKey === 'muge' || normalizedDetailTarget === 'muge'
        ? 'muge' as const
        : gameplayKey === 'milk' || normalizedDetailTarget === 'milk'
          ? 'milk' as const
          : gameplayKey === 'wish' || normalizedDetailTarget === 'wish'
            ? 'wish' as const
            : gameplayKey === 'happy' || normalizedDetailTarget === 'happy'
              ? 'happy' as const
              : gameplayKey === 'pet' || normalizedDetailTarget === 'pet'
                ? 'pet' as const
                : gameplayKey === 'weather' || normalizedDetailTarget === 'weather'
                  ? 'weather' as const
                  : gameplayKey === 'charity' || normalizedDetailTarget === 'charity'
                    ? 'charity' as const
                    : gameplayKey === 'qingmei' || normalizedDetailTarget === 'qingmei'
                      ? 'qingmei' as const
                      : gameplayKey === 'qixi' || normalizedDetailTarget === 'qixi'
                        ? 'qixi' as const
                        : gameplayKey === 'yishuhuanfu' || normalizedDetailTarget === 'yishuhuanfu'
                          ? 'yishuhuanfu' as const
                          : gameplayKey === 'stellar' || normalizedDetailTarget
                            ? 'stellar' as const
                            : null,
      gameplayTargets: gameplayTargets.length > 0 ? gameplayTargets : normalizedDetailTarget ? [normalizedDetailTarget] : [],
      detailTarget: normalizedDetailTarget,
    }
  }).filter(entry => entry.id)
}

function normalizeQixi(value: unknown): QixiActivityDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const balances = record(raw.balances)
  const bridge = record(raw.bridge)
  const gift = record(raw.gift)
  const dew = record(raw.dew)
  const dewSellPrice = record(first(dew.sellPrice, dew.sell_price))
  const actions = record(raw.actions)
  const dewBalance = first(dew.balance, balances.dew)
  return {
    groupId: text(raw.groupId, raw.group_id),
    activityId: text(raw.activityId, raw.activity_id, raw.bridgeActivityId, raw.bridge_activity_id),
    bridgeActivityId: text(raw.bridgeActivityId, raw.bridge_activity_id),
    giftActivityId: text(raw.giftActivityId, raw.gift_activity_id),
    name: text(raw.name, '鹊桥寄情'),
    title: text(raw.title, raw.name, '鹊桥寄情'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    active: bool(raw.active),
    rules: normalizeRules(raw.rules),
    feather: normalizeItem(raw.feather),
    sachet: normalizeItem(raw.sachet),
    receivedSachet: normalizeItem(first(raw.receivedSachet, raw.received_sachet)),
    dew: {
      ...normalizeItem(dew),
      balance: dewBalance === null || dewBalance === undefined ? null : text(dewBalance),
      balanceKnown: bool(dew.balanceKnown, dew.balance_known, balances.known),
      usable: bool(dew.usable),
      sellable: bool(dew.sellable),
      sellStatus: text(dew.sellStatus, dew.sell_status),
      sellCondition: text(dew.sellCondition, dew.sell_condition),
      sellPrice: Object.keys(dewSellPrice).length
        ? {
            currencyId: text(dewSellPrice.currencyId, dewSellPrice.currency_id),
            amount: text(dewSellPrice.amount, dewSellPrice.price),
            currencyName: text(dewSellPrice.currencyName, dewSellPrice.currency_name),
            currencyImage: text(dewSellPrice.currencyImage, dewSellPrice.currency_image),
          }
        : null,
    },
    balances: {
      feather: balances.feather === null || balances.feather === undefined ? null : text(balances.feather),
      sachet: balances.sachet === null || balances.sachet === undefined ? null : text(balances.sachet),
      receivedSachet: balances.receivedSachet === null || balances.receivedSachet === undefined
        ? null
        : text(balances.receivedSachet),
      dew: balances.dew === null || balances.dew === undefined ? null : text(balances.dew),
      known: bool(balances.known),
    },
    bridge: {
      currentStage: finiteNumber(first(bridge.currentStage, bridge.current_stage)) || 0,
      stages: records(bridge.stages).map(stage => ({
        id: text(stage.id, stage.stage),
        stage: finiteNumber(stage.stage) || 0,
        statusCode: text(stage.statusCode, stage.status_code, stage.status),
        completed: bool(stage.completed),
        claimed: bool(stage.claimed),
        claimable: bool(stage.claimable),
        current: bool(stage.current),
        cost: normalizeItem(stage.cost),
        rewards: records(stage.rewards).map(normalizeItem),
      })),
      claimable: bool(bridge.claimable),
      rewardRedDot: bool(bridge.rewardRedDot, bridge.reward_red_dot),
      displayItems: records(first(bridge.displayItems, bridge.display_items)).map(normalizeItem),
    },
    gift: {
      sentCount: text(gift.sentCount, gift.sent_count),
      sendLimit: text(gift.sendLimit, gift.send_limit),
      receiveLimit: text(gift.receiveLimit, gift.receive_limit),
      exchanges: records(gift.exchanges).map(exchange => ({
        costItems: records(first(exchange.costItems, exchange.cost_items)).map(normalizeItem),
        receiveItems: records(first(exchange.receiveItems, exchange.receive_items)).map(normalizeItem),
        giftType: text(exchange.giftType, exchange.gift_type),
        content: text(exchange.content),
      })),
      messageTextId: text(gift.messageTextId, gift.message_text_id, 15),
    },
    actions: {
      bridge: normalizeAction(actions, {}, ['bridge']),
      gift: normalizeAction(actions, {}, ['gift']),
      dew: normalizeAction(actions, {}, ['dew']),
    },
  }
}

/**
 * 背包余额的本地兜底。
 *
 * 余额来自游戏网关的 Bag 请求，偶发 `itempb.ItemService.Bag timeout`；后端一次读不到
 * 就会把 balance 置空，界面上原本正常的数字瞬间变成 "--"，看起来像功能坏了。
 * 但这个活动里的三份余额只会因为本页四个写操作（领种子/卖薯/兑换/分享）变化，而每次
 * 写操作成功后后端都会回最新值，所以把最近一次成功值记在 localStorage 里复用，
 * 比直接抹成 "--" 更诚实：数字是上一次的真实值，只是可能晚几秒刷新，同时标 stale。
 */
const YSHF_BALANCE_CACHE_KEY = 'yshf:balance-cache:v1'

interface YshfBalanceCacheEntry {
  seed: string | null
  sweetPotato: string | null
  luckCoin: string | null
}

function yshfBalanceCache(): Record<string, YshfBalanceCacheEntry> {
  try {
    const store = (globalThis as any).localStorage
    const raw = store ? store.getItem(YSHF_BALANCE_CACHE_KEY) : null
    const parsed = raw ? JSON.parse(raw) : null
    return isRecord(parsed) ? parsed as Record<string, YshfBalanceCacheEntry> : {}
  } catch {
    return {}
  }
}

function writeYshfBalanceCache(key: string, entry: YshfBalanceCacheEntry) {
  if (!key)
    return
  try {
    const store = (globalThis as any).localStorage
    if (!store)
      return
    const cache = yshfBalanceCache()
    cache[key] = entry
    store.setItem(YSHF_BALANCE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage 不可用（隐私模式 / 配额满）时忽略，不影响主流程。
  }
}

function applyYishuHuanfuBalanceFallback(dto: YishuHuanfuActivityDto): YishuHuanfuActivityDto {
  const key = dto.shop.gid || dto.activityId
  const cached = key ? yshfBalanceCache()[key] : undefined
  const result: YishuHuanfuActivityDto = { ...dto }
  let usedCache = false

  if (!result.seedBalanceKnown && cached?.seed !== null && cached?.seed !== undefined) {
    result.seedBalance = cached.seed
    result.seedBalanceKnown = true
    usedCache = true
  }
  if (!result.sweetPotatoBalanceKnown && cached?.sweetPotato !== null && cached?.sweetPotato !== undefined) {
    result.sweetPotatoBalance = cached.sweetPotato
    result.sweetPotatoBalanceKnown = true
    usedCache = true
  }
  if (!result.luckCoinBalanceKnown && cached?.luckCoin !== null && cached?.luckCoin !== undefined) {
    result.luckCoinBalance = cached.luckCoin
    result.luckCoinBalanceKnown = true
    usedCache = true
  }

  if (usedCache) {
    // 沿用旧值时不显示红色报错，只留一句弱提示。
    result.balanceStale = true
    result.balanceError = ''
  }

  // 只要这次至少拿到一项真实值就把缓存刷新（未拿到的项保留旧值，避免被 null 覆盖）。
  if (dto.seedBalanceKnown || dto.sweetPotatoBalanceKnown || dto.luckCoinBalanceKnown) {
    writeYshfBalanceCache(key, {
      seed: dto.seedBalanceKnown ? dto.seedBalance : (cached?.seed ?? null),
      sweetPotato: dto.sweetPotatoBalanceKnown ? dto.sweetPotatoBalance : (cached?.sweetPotato ?? null),
      luckCoin: dto.luckCoinBalanceKnown ? dto.luckCoinBalance : (cached?.luckCoin ?? null),
    })
  }

  return result
}

function normalizeYishuHuanfu(value: unknown): YishuHuanfuActivityDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const actions = record(raw.actions)
  const shop = record(raw.shop)
  const daily = record(raw.daily)
  const seed = record(raw.seed)
  const sweetPotato = record(raw.sweetPotato)
  const luckCoin = record(raw.luckCoin)
  const action = (key: string) => normalizeAction(actions, {}, [key])
  const normalized: YishuHuanfuActivityDto = {
    groupId: text(raw.groupId, raw.group_id),
    activityId: text(raw.activityId, raw.activity_id),
    name: text(raw.name, '以薯换福'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    rules: normalizeRules(raw.rules),
    active: bool(raw.active),
    serverTime: text(raw.serverTime, raw.server_time),
    shop: {
      gid: text(shop.gid),
      price: text(shop.price),
      priceKnown: bool(shop.priceKnown, shop.price_known),
      quoteTime: text(shop.quoteTime, shop.quote_time),
      selfPrice: text(shop.selfPrice, shop.self_price),
      bonus: text(shop.bonus),
      estimatedPrice: shop.estimatedPrice === null || shop.estimatedPrice === undefined
        ? null
        : text(shop.estimatedPrice),
      quota: shop.quota === null || shop.quota === undefined ? null : text(shop.quota),
      quotaCap: text(shop.quotaCap, shop.quota_cap),
      quotaUsed: shop.quotaUsed === null || shop.quotaUsed === undefined ? null : text(shop.quotaUsed),
    },
    seed: normalizeItem(seed),
    seedBalance: seed.balance === null || seed.balance === undefined ? null : text(seed.balance),
    seedBalanceKnown: bool(seed.balanceKnown, seed.balance_known),
    sweetPotato: normalizeItem(sweetPotato),
    sweetPotatoBalance: sweetPotato.balance === null || sweetPotato.balance === undefined ? null : text(sweetPotato.balance),
    sweetPotatoBalanceKnown: bool(sweetPotato.balanceKnown, sweetPotato.balance_known),
    luckCoin: normalizeItem(luckCoin),
    luckCoinBalance: luckCoin.balance === null || luckCoin.balance === undefined ? null : text(luckCoin.balance),
    luckCoinBalanceKnown: bool(luckCoin.balanceKnown, luckCoin.balance_known),
    catalog: records(raw.catalog).map(entry => ({
      index: finiteNumber(first(entry.index)) || 0,
      itemId: entry.itemId === null || entry.itemId === undefined ? null : text(entry.itemId),
      name: text(entry.name),
      nameKnown: bool(entry.nameKnown, entry.name_known),
      price: text(entry.price),
      status: finiteNumber(first(entry.status)) || 0,
      limit: text(entry.limit),
      exchangedToday: text(entry.exchangedToday, entry.exchanged_today, '0'),
      image: text(entry.image),
      // 可兑性由 cmd 97 的 exchangeable 决定；缺这个字段（例如后端只透传了目录骨架）
      // 时按“可兑”处理，价格够不够再由渲染层按余额判一次。
      // 早期这里写死 false，导致 loadCatalog 拿到的目录被 applySnapshot 再归一化后
      // 整排变成「暂不可兑」，福气币再多也点不动。
      exchangeable: entry.exchangeable === null || entry.exchangeable === undefined
        ? true
        : bool(entry.exchangeable),
    })),
    catalogLoaded: bool(raw.catalogLoaded, raw.catalog_loaded),
    commission: {
      pending: text(record(raw.commission).pending),
      claimable: bool(record(raw.commission).claimable),
      flag: text(record(raw.commission).flag),
    },
    balanceError: text(raw.balanceError, raw.balance_error),
    balanceStale: bool(raw.balanceStale, raw.balance_stale),
    daily: {
      dateKey: text(daily.dateKey, daily.date_key),
      seedClaimed: bool(daily.seedClaimed, daily.seed_claimed),
      shared: bool(daily.shared),
      sharedToday: bool(daily.sharedToday, daily.shared_today, daily.quoteGeneratedToday, daily.quote_generated_today),
    },
    actions: {
      claimSeed: action('claimSeed'),
      sell: action('sell'),
      share: action('share'),
      exchange: { ...action('exchange'), reason: text(record(actions.exchange).reason) },
    },
  }
  return applyYishuHuanfuBalanceFallback(normalized)
}

/**
 * 活动详情快照不带兑换目录（cmd 97 是独立命令），每次轮询刷新都会把已加载的目录清空，
 * 表现就是档位闪一下没了、按钮回到「未加载」。这里保留上一次的目录，
 * 页面主动刷新时会再用 cmd 97 拉一遍最新价与剩余次数。
 */
function keepCatalogOnRefresh(previous: Record<string, unknown>, incoming: unknown): unknown {
  const next = record(incoming)
  if (records(next.catalog).length > 0)
    return incoming
  const previousCatalog = records(previous.catalog)
  if (previousCatalog.length === 0)
    return incoming
  return { ...next, catalog: previousCatalog, catalogLoaded: true }
}

function normalizeQingMei(value: unknown): QingMeiActivityDto | null {  if (!isRecord(value))
    return null
  const raw = value
  const actions = record(raw.actions)
  const dailySeedRaw = record(raw.dailySeed)
  const quoteRaw = record(raw.quote)
  const action = (key: string) => normalizeAction(actions, {}, [key])
  return {
    activityId: text(raw.activityId, raw.activity_id),
    dailyActivityId: text(raw.dailyActivityId, raw.daily_activity_id),
    name: text(raw.name, '青酿换万金'),
    title: text(raw.title, raw.name, '青酿换万金'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    rules: normalizeRules(raw.rules),
    ingredient: normalizeItem(raw.ingredient),
    ingredients: records(raw.ingredients).map((entry) => {
      const uid = text(entry.uid)
      const mutantTypes = Array.isArray(entry.mutantTypes) ? entry.mutantTypes.map(String) : []
      const mutantTypeNames = Array.isArray(entry.mutantTypeNames)
        ? entry.mutantTypeNames.map(String).filter(Boolean)
        : (Array.isArray(entry.mutantEffects)
            ? entry.mutantEffects.map((effect: any) => String(effect?.name || '')).filter(Boolean)
            : [])
      return {
        ...normalizeItem(entry),
        uid,
        key: text(entry.key, `${uid}:${mutantTypes.join(',')}`),
        mutantTypes,
        mutantTypeNames,
      }
    }),
    balance: raw.balance === null || raw.balance === undefined ? null : text(raw.balance),
    balanceKnown: bool(raw.balanceKnown),
    baseGold: text(raw.baseGold),
    basePrice: text(raw.basePrice),
    guaranteedPrice: text(raw.guaranteedPrice),
    currentRound: finiteNumber(raw.currentRound) || 0,
    started: bool(raw.started),
    maxRounds: finiteNumber(raw.maxRounds) || 3,
    finished: bool(raw.finished),
    quotePrices: Array.isArray(raw.quotePrices) ? raw.quotePrices.map(String) : [],
    quoteTotals: Array.isArray(raw.quoteTotals) ? raw.quoteTotals.map(String) : [],
    quote: Object.keys(quoteRaw).length
      ? {
          round: finiteNumber(quoteRaw.round) || 0,
          unitPrice: text(quoteRaw.unitPrice),
          totalGold: text(quoteRaw.totalGold),
          doubled: bool(quoteRaw.doubled),
        }
      : null,
    dailySeed: Object.keys(dailySeedRaw).length
      ? {
          claimed: bool(dailySeedRaw.claimed),
          grantId: text(dailySeedRaw.grantId),
          reward: normalizeItem(dailySeedRaw.reward),
        }
      : null,
    actions: {
      claimSeed: action('claimSeed'),
      start: action('start'),
      continue: action('continue'),
      settle: action('settle'),
    },
  }
}

function normalizeWeatherStatus(value: unknown): WeatherStatusDto {
  const raw = record(value)
  const beginTime = toMilliseconds(first(raw.beginTime, raw.begin_time))
  const endTime = toMilliseconds(first(raw.endTime, raw.end_time))
  return {
    hostGid: text(raw.hostGid, raw.host_gid),
    type: finiteNumber(first(raw.type, raw.weatherType, raw.weather_type)) || 0,
    status: finiteNumber(raw.status) || 0,
    beginTime,
    endTime,
    source: finiteNumber(raw.source) || 0,
    field8: finiteNumber(first(raw.field8, raw.field_8)) || 0,
    friendMarker: finiteNumber(first(raw.friendMarker, raw.friend_marker, raw.field9, raw.field_9)) || 0,
    collectedThisCycle: bool(
      raw.collectedThisCycle,
      raw.collected_this_cycle,
      raw.collectedToday,
      raw.collected_today,
    ),
    active: bool(raw.active),
    isThunderstorm: bool(raw.isThunderstorm, raw.is_thunderstorm),
    remainingSec: Math.max(0, finiteNumber(first(raw.remainingSec, raw.remaining_sec)) || 0),
    durationSec: beginTime !== null && endTime !== null ? Math.max(0, Math.round((endTime - beginTime) / 1000)) : 0,
  }
}

function normalizeCharityRedFlower(value: unknown): CharityRedFlowerActivityDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const seedReward = record(first(raw.seedReward, raw.seed_reward))
  const dailyGift = record(first(raw.dailyGift, raw.daily_gift))
  const publicFund = record(first(dailyGift.publicFund, dailyGift.public_fund))
  const globalProgress = record(first(raw.globalProgress, raw.global_progress))
  const settlement = record(raw.settlement)
  const actions = record(raw.actions)
  return {
    groupId: text(raw.groupId, raw.group_id),
    activityId: text(raw.activityId, raw.activity_id),
    name: text(raw.name, '公益小红花'),
    title: text(raw.title, raw.name, '公益小红花'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    active: bool(raw.active),
    rules: normalizeRules(raw.rules),
    love: normalizeItem(raw.love),
    loveBalance: text(raw.loveBalance, raw.love_balance),
    donatedLove: text(raw.donatedLove, raw.donated_love),
    flowStatus: text(raw.flowStatus, raw.flow_status),
    agreementStatus: text(raw.agreementStatus, raw.agreement_status),
    seedReward: {
      statusCode: text(seedReward.statusCode, seedReward.status_code),
      claimable: bool(seedReward.claimable),
      claimed: bool(seedReward.claimed),
      reward: normalizeItem(seedReward.reward),
    },
    dailyGift: {
      statusCode: text(dailyGift.statusCode, dailyGift.status_code),
      claimed: bool(dailyGift.claimed),
      harvestedToday: bool(dailyGift.harvestedToday, dailyGift.harvested_today),
      reward: normalizeItem(dailyGift.reward),
      publicFund: Object.keys(publicFund).length > 0
        ? { date: text(publicFund.date), statusCode: text(publicFund.statusCode, publicFund.status_code) }
        : null,
    },
    progressRewards: records(first(raw.progressRewards, raw.progress_rewards)).map(entry => ({
      target: text(entry.target),
      reward: normalizeItem(entry.reward),
      statusCode: text(entry.statusCode, entry.status_code, entry.status),
      reached: bool(entry.reached),
      claimed: bool(entry.claimed),
      claimable: bool(entry.claimable, entry.canClaim, entry.available),
      claimSupported: bool(entry.claimSupported, entry.claim_supported),
    })),
    globalProgress: {
      donated: text(globalProgress.donated),
      target: text(globalProgress.target),
      reached: bool(globalProgress.reached),
      rewardTarget: text(globalProgress.rewardTarget, globalProgress.reward_target),
      reward: normalizeItem(globalProgress.reward),
    },
    settlement: {
      requiredLove: text(settlement.requiredLove, settlement.required_love),
      eligible: bool(settlement.eligible),
      globalReached: bool(settlement.globalReached, settlement.global_reached),
      personalReached: bool(settlement.personalReached, settlement.personal_reached),
      reward: normalizeItem(settlement.reward),
    },
    actions: {
      claimSeeds: normalizeAction(actions, {}, ['claimSeeds', 'claim_seeds']),
      donateLove: normalizeAction(actions, {}, ['donateLove', 'donate_love']),
      claimDailyGift: normalizeAction(actions, {}, ['claimDailyGift', 'claim_daily_gift']),
    },
  }
}

function normalizeWeatherFriend(value: unknown): WeatherFriendDto {
  const raw = record(value)
  const availabilityValue = text(raw.availability).toLowerCase()
  const availability: WeatherFriendDto['availability'] = ['unknown', 'available', 'collected', 'expired', 'unavailable'].includes(availabilityValue)
    ? availabilityValue as WeatherFriendDto['availability']
    : 'unknown'
  const cloudLandIds = first(raw.eligibleCloudLandIds, raw.eligible_cloud_land_ids)
  return {
    gid: text(raw.gid),
    name: text(raw.name, raw.remark),
    avatarUrl: text(raw.avatarUrl, raw.avatar_url),
    level: finiteNumber(raw.level) || 0,
    inspected: bool(raw.inspected),
    inspectedAt: toMilliseconds(first(raw.inspectedAt, raw.inspected_at)),
    scanError: text(raw.scanError, raw.scan_error),
    availability,
    availabilityReason: text(raw.availabilityReason, raw.availability_reason),
    canCollect: bool(raw.canCollect, raw.can_collect),
    eligibleCloudLandIds: Array.isArray(cloudLandIds) ? cloudLandIds.map(entry => text(entry)).filter(Boolean) : [],
    weather: normalizeWeatherStatus(raw.weather),
  }
}

function normalizeWeatherCommand(value: unknown): WeatherCommandDto {
  const raw = record(value)
  return {
    enabled: typeof value === 'boolean' ? value : bool(raw.enabled, raw.available),
    reason: text(raw.reason),
    batchSize: Math.max(1, finiteNumber(first(raw.batchSize, raw.batch_size)) || WEATHER_SCAN_BATCH_SIZE),
    friendCount: finiteNumber(first(raw.friendCount, raw.friend_count)) || 0,
    nodeId: text(raw.nodeId, raw.node_id),
    dailyLimit: finiteNumber(first(raw.dailyLimit, raw.daily_limit)) || 0,
  }
}

function weatherStatusName(status: string, active: boolean) {
  if (!active || !status || status === '0')
    return '未生效'
  if (status === '2')
    return '生效中'
  return `未知状态（${status}）`
}

function normalizeWeather(value: unknown): WeatherActivityDto | null {
  if (!isRecord(value))
    return null
  const raw = value
  const localInventory = records(raw.inventory)
  const localActivity = record(raw.activity)
  const localOwnWeather = record(first(raw.ownWeather, raw.own_weather))
  // The capture-verified service exposes a richer DTO than the upstream view.
  // Adapt it here so the upstream layout can be retained without changing the
  // verified field-107 collection and field-140 research operations.
  if (Array.isArray(raw.inventory) || Object.keys(localOwnWeather).length > 0) {
    const itemNames: Record<string, string> = {
      1027: '雷电徽章',
      4002: '闪电感应',
      4003: '闪电感应',
      5001: '天气采集瓶',
      5002: '雷雨召唤瓶',
      5003: '闪电变异瓶',
      5004: '霹雳引雷瓶',
      5005: '青蛙使坏瓶',
      5006: '乌云使坏瓶',
    }
    const localItem = (id: string) => normalizeItem(
      localInventory.find(item => text(item.id, item.itemId, item.item_id) === id)
      || { id, name: itemNames[id] || `物品 ${id}`, count: '0' },
    )
    const badge = localItem('1027')
    const collectionBottle = localItem('5001')
    const rainBottle = localItem('5002')
    const lightningSensePrimary = localItem('4002')
    const lightningSenseSecondary = localItem('4003')
    const lightningSenseCount = (Number(lightningSensePrimary.count) || 0) + (Number(lightningSenseSecondary.count) || 0)
    const localShop = record(raw.shop)
    const localCollector = record(raw.collector)
    const localResearch = record(raw.research)
    const localActions = record(raw.actions)
    const researchAction = record(first(localActions.advanceResearch, localActions.advance_research))
    const activityName = text(localActivity.name, '雨落成诗')
    const activeWeather = bool(localOwnWeather.active)
    const weatherKind = text(localOwnWeather.type)
    const weatherStatus = text(localOwnWeather.status)
    return {
      groupId: text(raw.groupId, raw.group_id, localActivity.groupId, localActivity.group_id),
      activityId: text(localActivity.id, localActivity.activityId, localActivity.activity_id, raw.groupId, raw.group_id),
      catalogActivityId: text(localShop.activityId, localShop.activity_id, '2026070301'),
      taskActivityId: text(localCollector.activityId, localCollector.activity_id, '2026070303'),
      researchActivityId: text(localResearch.activityId, localResearch.activity_id, '2026070304'),
      name: activityName,
      title: activityName,
      startTime: toMilliseconds(first(localActivity.startTime, localActivity.start_time)),
      endTime: toMilliseconds(first(localActivity.endTime, localActivity.end_time)),
      serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
      active: bool(raw.active),
      rules: normalizeRules(raw.rules),
      badge,
      balances: {
        badge: badge.count,
        collectionBottle: collectionBottle.count,
        rainBottle: rainBottle.count,
        known: true,
      },
      inventory: {
        known: true,
        collectionBottle,
        rainBottle,
        lightningMutationBottle: localItem('5003'),
        lightningAttractBottle: localItem('5004'),
        frogBottle: localItem('5005'),
        darkCloudBottle: localItem('5006'),
        lightningSense: {
          ...lightningSensePrimary,
          name: lightningSensePrimary.name || lightningSenseSecondary.name || '闪电感应',
          count: String(lightningSenseCount),
          effectPerItemPercent: 2,
          effectPercent: lightningSenseCount * 2,
          passive: true,
          active: lightningSenseCount > 0,
        },
      },
      weather: Object.keys(localOwnWeather).length > 0
        ? {
            id: activeWeather ? weatherKind : '0',
            type: weatherStatus,
            typeName: weatherKind === '1' ? '雷雨' : (activeWeather ? `未知天气（ID ${weatherKind || '--'}）` : '无'),
            statusName: weatherStatusName(weatherStatus, activeWeather),
            beginTime: toMilliseconds(first(localOwnWeather.beginTime, localOwnWeather.begin_time)),
            endTime: toMilliseconds(first(localOwnWeather.endTime, localOwnWeather.end_time)),
            active: activeWeather,
          }
        : null,
      friends: records(raw.friends).map(normalizeWeatherFriend),
      catalog: Object.keys(localShop).length > 0
        ? [{
            id: text(localShop.goodsId, localShop.goods_id),
            item: normalizeItem(localShop.item),
            cost: normalizeItem(localShop.cost),
            status: text(localShop.statusCode, localShop.status_code),
            name: text(record(localShop.item).name, '天气瓶补给'),
          }]
        : [],
      progress: {
        taskId: '',
        current: '0',
        target: '0',
        item: normalizeItem({}),
        reward: normalizeItem({}),
        rewardStatus: '',
        status: '',
        active: false,
      },
      tasks: records(raw.tasks).map(task => ({
        id: text(task.id, task.taskId, task.task_id),
        itemId: text(task.triggerItemId, task.trigger_item_id, task.itemId, task.item_id),
        name: text(task.title, task.name),
        target: text(task.dailyLimit, task.daily_limit, task.target),
        reward: normalizeItem(task.reward),
        current: text(task.current, '0'),
        active: bool(task.active),
      })),
      research: records(localResearch.nodes).map(node => ({
        id: text(node.id, node.nodeId, node.node_id),
        prerequisites: Array.isArray(node.prerequisiteNodeIds)
          ? node.prerequisiteNodeIds.map(String)
          : (Array.isArray(node.prerequisite_node_ids) ? node.prerequisite_node_ids.map(String) : []),
        status: text(node.statusCode, node.status_code, node.status),
        opened: !bool(node.locked),
        claimed: bool(node.completed, node.claimed),
        claimable: bool(node.availableByStatus, node.available_by_status, node.claimable),
        current: bool(node.availableByStatus, node.available_by_status, node.current),
        featured: bool(node.featured),
        extra: text(node.field9, node.field_9, node.extra),
        cost: normalizeItem(node.cost),
        reward: normalizeItem(node.reward),
      })),
      actions: {
        research: {
          enabled: bool(researchAction.enabled),
          available: bool(researchAction.enabled),
          availabilityKnown: true,
          count: null,
        },
        scanFriendWeather: normalizeWeatherCommand(first(localActions.scanFriendWeather, localActions.scan_friend_weather)),
      },
    }
  }
  const balances = record(raw.balances)
  const inventory = record(raw.inventory)
  const weather = record(raw.weather)
  const progress = record(raw.progress)
  const actions = record(raw.actions)
  return {
    groupId: text(raw.groupId, raw.group_id),
    activityId: text(raw.activityId, raw.activity_id),
    catalogActivityId: text(raw.catalogActivityId, raw.catalog_activity_id),
    taskActivityId: text(raw.taskActivityId, raw.task_activity_id),
    researchActivityId: text(raw.researchActivityId, raw.research_activity_id),
    name: text(raw.name, '雨落成诗'),
    title: text(raw.title, raw.name, '雨落成诗'),
    startTime: toMilliseconds(first(raw.startTime, raw.start_time)),
    endTime: toMilliseconds(first(raw.endTime, raw.end_time)),
    serverTime: toMilliseconds(first(raw.serverTime, raw.server_time)),
    active: bool(raw.active),
    rules: normalizeRules(raw.rules),
    badge: normalizeItem(raw.badge),
    balances: {
      badge: balances.badge == null ? null : text(balances.badge),
      collectionBottle: balances.collectionBottle == null && balances.collection_bottle == null
        ? null
        : text(balances.collectionBottle, balances.collection_bottle),
      rainBottle: balances.rainBottle == null && balances.rain_bottle == null
        ? null
        : text(balances.rainBottle, balances.rain_bottle),
      known: bool(balances.known),
    },
    inventory: {
      known: bool(inventory.known, balances.known),
      collectionBottle: normalizeItem(first(inventory.collectionBottle, inventory.collection_bottle)),
      rainBottle: normalizeItem(first(inventory.rainBottle, inventory.rain_bottle)),
      lightningMutationBottle: normalizeItem(first(inventory.lightningMutationBottle, inventory.lightning_mutation_bottle)),
      lightningAttractBottle: normalizeItem(first(inventory.lightningAttractBottle, inventory.lightning_attract_bottle)),
      frogBottle: normalizeItem(first(inventory.frogBottle, inventory.frog_bottle)),
      darkCloudBottle: normalizeItem(first(inventory.darkCloudBottle, inventory.dark_cloud_bottle)),
      lightningSense: {
        ...normalizeItem(first(inventory.lightningSense, inventory.lightning_sense)),
        effectPerItemPercent: finiteNumber(record(first(inventory.lightningSense, inventory.lightning_sense)).effectPerItemPercent) || 2,
        effectPercent: finiteNumber(record(first(inventory.lightningSense, inventory.lightning_sense)).effectPercent) || 0,
        passive: bool(record(first(inventory.lightningSense, inventory.lightning_sense)).passive, true),
        active: bool(record(first(inventory.lightningSense, inventory.lightning_sense)).active),
      },
    },
    weather: Object.keys(weather).length
      ? (() => {
          const weatherType = text(weather.id, weather.weatherId, weather.weather_id)
          const status = text(weather.type, weather.status, weather.weatherStatus, weather.weather_status)
          const active = bool(weather.active) || !['', '0'].includes(weatherType)
          return {
            id: weatherType,
            type: status,
            typeName: weather.typeName == null
              ? (weather.type_name == null ? null : text(weather.type_name))
              : text(weather.typeName),
            statusName: text(weather.statusName, weather.status_name) || weatherStatusName(status, active),
            beginTime: toMilliseconds(first(weather.beginTime, weather.begin_time)),
            endTime: toMilliseconds(first(weather.endTime, weather.end_time)),
            active,
          }
        })()
      : null,
    friends: records(raw.friends).map(normalizeWeatherFriend),
    catalog: records(raw.catalog).map(entry => ({
      id: text(entry.id),
      item: normalizeItem(entry.item),
      cost: normalizeItem(entry.cost),
      status: text(entry.status),
      name: text(entry.name),
    })),
    progress: {
      taskId: text(progress.taskId, progress.task_id),
      current: text(progress.current),
      target: text(progress.target),
      item: normalizeItem(progress.item),
      reward: normalizeItem(progress.reward),
      rewardStatus: text(progress.rewardStatus, progress.reward_status),
      status: text(progress.status),
      active: bool(progress.active),
    },
    tasks: records(raw.tasks).map(task => ({
      id: text(task.id, task.taskId, task.task_id),
      itemId: text(task.itemId, task.item_id),
      name: text(task.name),
      target: text(task.target),
      reward: normalizeItem(task.reward),
      current: text(task.current),
      active: bool(task.active),
    })),
    research: records(raw.research).map(node => ({
      id: text(node.id, node.nodeId, node.node_id),
      prerequisites: Array.isArray(node.prerequisites) ? node.prerequisites.map(String) : [],
      status: text(node.status),
      opened: bool(node.opened),
      claimed: bool(node.claimed),
      claimable: bool(node.claimable),
      current: bool(node.current),
      featured: bool(node.featured),
      extra: text(node.extra),
      cost: normalizeItem(node.cost),
      reward: normalizeItem(node.reward),
    })),
    actions: {
      research: normalizeAction(actions, {}, ['research']),
      scanFriendWeather: normalizeWeatherCommand(first(actions.scanFriendWeather, actions.scan_friend_weather)),
    },
  }
}

function findAction(source: ActivityRecord, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (source[alias] !== undefined)
      return source[alias]
  }
  return undefined
}

function normalizeAction(actions: ActivityRecord, capabilities: ActivityRecord, aliases: string[]): ActivityActionDto {
  const actionValue = findAction(actions, aliases)
  const capabilityValue = findAction(capabilities, aliases)
  const action = record(actionValue)
  const capability = record(capabilityValue)
  const count = finiteNumber(first(action.count, action.badge, action.availableCount, action.available_count))
  const enabled = typeof actionValue === 'boolean'
    ? actionValue
    : typeof capabilityValue === 'boolean'
      ? capabilityValue
      : bool(action.enabled, action.allowed, capability.enabled, capability.allowed, capability.available)
  const explicitAvailable = nullableBoolean(action.available)
  const available = typeof actionValue === 'boolean'
    ? actionValue
    : explicitAvailable !== null
      ? explicitAvailable
      : bool(action.pending, action.redDot, action.red_dot, action.active) || (count !== null && count > 0)
  const attemptableValue = nullableBoolean(first(action.attemptable, capability.attemptable))
  const attemptableCount = finiteNumber(first(action.attemptableCount, action.attemptable_count, capability.attemptableCount, capability.attemptable_count))
  const availabilityKnownValue = first(action.availabilityKnown, action.availability_known, capability.availabilityKnown, capability.availability_known)
  const availabilityKnown = availabilityKnownValue === undefined || availabilityKnownValue === null || availabilityKnownValue === ''
    ? typeof actionValue === 'boolean' || action.available !== undefined || count !== null
    : bool(availabilityKnownValue)
  return {
    enabled,
    available,
    ...(attemptableValue !== null ? { attemptable: attemptableValue } : {}),
    ...(attemptableCount !== null ? { attemptableCount } : {}),
    availabilityKnown,
    count,
  }
}

export function normalizeActivitySnapshot(value: unknown): ActivityCenterSnapshotDto {
  const envelope = record(value)
  const root = record(first(envelope.snapshot, envelope.data, value))
  const seasonRaw = first(root.season, root.seasonEvent, root.season_event)
  const seasonRecord = record(seasonRaw)
  const actionsRaw = record(first(root.actions, seasonRecord.actions))
  const capabilitiesRaw = record(first(root.capabilities, seasonRecord.capabilities, record(root.shop).capabilities, record(first(root.solarTerms, root.solar)).capabilities))
  return {
    serverTime: toMilliseconds(first(root.serverTime, root.server_time)),
    activities: normalizeActivityDirectory(first(root.activities, root.activityList, root.activity_list)),
    season: normalizeSeason(seasonRaw),
    shop: normalizeShop(first(root.shop, root.starSandShop, root.star_sand_shop)),
    solarTerms: normalizeSolarTerms(first(root.solarTerms, root.solar_terms, root.solar)),
    constellation: normalizeConstellation(first(root.constellation, root.constellationActivity, seasonRecord.constellation, seasonRecord.constellationActivity, seasonRecord.starContract, seasonRecord.contract)),
    qixi: normalizeQixi(first(root.qixi, root.qiXi, root.qi_xi)),
    qingMei: normalizeQingMei(first(root.qingMei, root.qingmei, root.qing_mei)),
    yishuHuanfu: normalizeYishuHuanfu(first(root.yishuHuanfu, root.yishuhuanfu, root.yishu_huanfu)),
    charity: normalizeCharityRedFlower(first(root.charity, root.charityRedFlower, root.charity_red_flower)),
    weather: normalizeWeather(first(root.weather, root.weatherActivity, root.weather_activity)),
    actions: {
      claimPass: normalizeAction(actionsRaw, capabilitiesRaw, ['claimPass', 'passClaim', 'pass_claim']),
      lightConstellation: normalizeAction(actionsRaw, capabilitiesRaw, ['lightConstellation', 'constellationLight', 'constellation_light']),
      claimSolar: normalizeAction(actionsRaw, capabilitiesRaw, ['claimSolar', 'solarClaim', 'solar_claim']),
      exchange: normalizeAction(actionsRaw, capabilitiesRaw, ['exchange', 'shopExchange', 'shop_exchange']),
      qixiBridge: normalizeAction(actionsRaw, capabilitiesRaw, ['qixiBridge', 'qixi_bridge']),
      qixiGift: normalizeAction(actionsRaw, capabilitiesRaw, ['qixiGift', 'qixi_gift']),
      qixiDew: normalizeAction(actionsRaw, capabilitiesRaw, ['qixiDew', 'qixi_dew']),
      charityClaimSeeds: normalizeAction(actionsRaw, capabilitiesRaw, ['charityClaimSeeds', 'charity_claim_seeds']),
      charityDonateLove: normalizeAction(actionsRaw, capabilitiesRaw, ['charityDonateLove', 'charity_donate_love']),
      charityClaimDailyGift: normalizeAction(actionsRaw, capabilitiesRaw, ['charityClaimDailyGift', 'charity_claim_daily_gift']),
    },
  }
}

const activityErrorMessages: Record<string, string> = {
  1034038: '当前没有可点亮或可领取的星宿奖励，可能已经领取过，请稍后或明天再来看看',
  1034001: '当前活动暂不可操作，请稍后再试',
  1034002: '活动尚未开放或已经结束',
  1034177: '今日红薯种子已经领取，明天再来领取',
  YSHF_UNAVAILABLE: '以薯换福活动暂未开放或已经结束',
  YSHF_INACTIVE: '以薯换福活动未在活动期内',
  YSHF_SEED_ALREADY_CLAIMED: '今日红薯种子已经领取，明天再来领取',
  YSHF_SHARE_ALREADY_DONE: '今日铺子已经分享过了，明天再来',
  YSHF_QUOTE_NOT_READY: '今日收购价尚未生成，请先领取红薯种子',
  YSHF_OWN_GID_UNKNOWN: '暂时无法确定本人 GID，请稍后重试',
  YSHF_BALANCE_UNKNOWN: '读取不到蜜薯数量，请稍后重试',
  INSUFFICIENT_YSHF_SWEET_POTATO: '蜜薯数量不足，无法完成本次出售',
  INSUFFICIENT_YSHF_LUCK_COIN: '福气币不足，无法完成本次兑换',
  YSHF_EXCEED_LIMIT: '兑换数量超过本档剩余可兑换次数',
  INVALID_YSHF_EXCHANGE_COUNT: '兑换数量必须是正整数',
  INVALID_YSHF_CATALOG_INDEX: '商品序号无效，请刷新兑换商店后重试',
  YSHF_CATALOG_ENTRY_NOT_FOUND: '商品序号无效，请刷新兑换商店后重试',
  YSHF_RESPONSE_INVALID: '以薯换福活动数据已经变化，请刷新页面后重试',
  YSHF_NO_COMMISSION: '当前没有可领取的收购提成',
  YSHF_GID_UNKNOWN: '未获取到本人 gid，请稍后重试',
  YSHF_RESULT_UNKNOWN: '服务端回包与请求不一致，请刷新活动后再核对',
  YSHF_SHOP_UNKNOWN: '无法确认该铺子的主人，本次未出售',
  YSHF_SHOP_QUOTA_INSUFFICIENT: '目标铺子的剩余接收额度不足，本次未出售',
  INVALID_YSHF_SELL_COUNT: '出售数量必须是正整数',
  INVALID_YSHF_FRIEND_GID: '目标铺子 GID 无效',
  INVALID_YSHF_SHOP_GID: '目标铺子 GID 无效',
  NO_PASS_REWARD: '当前没有可领取的游记奖励，请完成新的游记等级后再试',
  SOLAR_TERM_UNAVAILABLE: '当前节令奖励暂不可领取，请在开放后再试',
  CONSTELLATION_UNAVAILABLE: '观星礼录活动暂未开放或已经结束',
  PASS_UNAVAILABLE: '千星游记活动暂未开放或已经结束',
  SOLAR_TERM_NOT_FOUND: '未找到该节令活动，请刷新页面后再试',
  SHOP_UNAVAILABLE: '星砂商店暂未开放，请稍后再来看看',
  INVALID_EXCHANGE_COUNT: '兑换数量必须是正整数',
  INVALID_SHOP_GOODS_ID: '商品信息无效，请刷新商店后重试',
  SHOP_GOODS_NOT_FOUND: '该商品已不在当前商店目录中，请刷新后重试',
  SHOP_GOODS_UNAVAILABLE: '该商品当前不可兑换，请刷新商店后重试',
  SHOP_BALANCE_UNAVAILABLE: '暂时无法确认星砂余额，请稍后重试',
  INSUFFICIENT_STAR_SAND: '星砂余额不足，无法完成本次兑换',
  SHOP_RESPONSE_INVALID: '商店数据已经变化，请刷新页面后重试',
  QIXI_UNAVAILABLE: '鹊桥寄情活动暂未开放或已经结束',
  QIXI_BRIDGE_UNAVAILABLE: '当前没有可领取的鹊桥奖励',
  QIXI_GIFT_UNAVAILABLE: '当前无法赠送鹊羽香囊',
  INVALID_QIXI_FRIEND_GID: '好友信息无效，请重新选择',
  INVALID_QIXI_MESSAGE_TEXT_ID: '祝福文案信息无效，请刷新活动后重试',
  INSUFFICIENT_QIXI_SACHET: '鹊羽香囊数量不足',
  QIXI_RESPONSE_INVALID: '鹊桥活动数据已经变化，请刷新页面后重试',
  QIXI_GIFT_FAILED: '鹊羽香囊赠送失败，请刷新后重试',
  1034091: '当前爱心不足，无法捐赠',
  1034087: '该公益进度奖励档位已经领取',
  1034088: '今天还没有收获小红花，暂时无法领取公益礼包',
  1034092: '今天还没有收获小红花，暂时无法领取公益礼包',
  CHARITY_RED_FLOWER_UNAVAILABLE: '公益小红花活动暂未开放或已经结束',
  CHARITY_RED_FLOWER_RESPONSE_INVALID: '公益小红花活动数据已经变化，请刷新页面后重试',
  CHARITY_SEEDS_UNAVAILABLE: '当前没有可领取的小红花种子',
  INSUFFICIENT_CHARITY_LOVE: '当前没有可捐赠的爱心',
  CHARITY_PROGRESS_REWARD_UNAVAILABLE: '当前没有可领取的公益进度奖励',
  CHARITY_PROGRESS_REWARD_ALREADY_CLAIMED: '该公益进度奖励档位已经领取',
  CHARITY_DAILY_GIFT_UNAVAILABLE: '今日公益礼包已经领取或暂不可领取',
  CHARITY_DAILY_GIFT_NOT_HARVESTED: '今天还没有收获小红花，暂时无法领取公益礼包',
  CHARITY_AGREEMENT_REQUIRED: '请先同意公益活动规则',
  INVALID_WEATHER_BOTTLE_COUNT: '天气瓶购买数量必须是正整数',
  INVALID_WEATHER_NODE: '研究节点信息无效，请刷新活动后重试',
  INVALID_WEATHER_TARGET_GID: '好友信息无效，请重新选择',
  WEATHER_BOTTLE_UNAVAILABLE: '背包中没有可用的雷雨召唤瓶',
  WEATHER_COLLECTION_BOTTLE_UNAVAILABLE: '背包中没有可用的天气采集瓶',
  INSUFFICIENT_WEATHER_BADGE: '雷电徽章不足，无法推进研究',
  WEATHER_STATE_UNAVAILABLE: '当前已有特殊天气，暂时无法召唤降雨',
  WEATHER_RESPONSE_INVALID: '天气活动数据已经变化，请刷新页面后重试',
  WEATHER_UNAVAILABLE: '雨落成诗活动暂未开放或已经结束',
  1034007: '活动天气瓶已达到限购次数',
  1033014: '当前已有特殊天气，暂时无法召唤降雨',
  1000019: '雷电徽章不足，无法推进研究',
  1034018: '天气采集瓶不足，无法采集',
  1034040: '当前这轮雷雨已经采过，下轮雷雨可再次采集',
  WEATHER_ACTIVITY_UNAVAILABLE: '雨落成诗活动尚未开放或已经结束',
  WEATHER_SHOP_UNAVAILABLE: '天气采集瓶商店当前不可用',
  WEATHER_SHOP_ALREADY_EXCHANGED: '今日已经兑换过天气采集瓶',
  INVALID_WEATHER_FRIEND_GID: '好友信息无效，请刷新活动后重新选择',
  WEATHER_SCAN_BATCH_TOO_LARGE: '单批检查的好友数量超出上限，请刷新页面后重试',
  WEATHER_COLLECTOR_UNAVAILABLE: '背包中没有可用的天气采集瓶',
  WEATHER_FRIEND_NOT_THUNDERSTORM: '该好友农场当前不是雷雨天气',
  WEATHER_ALREADY_COLLECTED: '当前这轮雷雨已经采过，下轮雷雨可再次采集',
  WEATHER_SUMMON_UNAVAILABLE: '背包中没有可用的雷雨召唤瓶',
  WEATHER_ALREADY_ACTIVE: '自己的农场当前已有特殊天气',
  INVALID_WEATHER_RESEARCH_NODE: '气象研究节点信息无效，请刷新后重试',
  WEATHER_RESEARCH_UNAVAILABLE: '气象研究数据暂不可用，请刷新后重试',
  WEATHER_RESEARCH_ALREADY_COMPLETED: '该气象研究节点已经完成',
  WEATHER_RESEARCH_LOCKED: '请先完成前置气象研究节点',
  INSUFFICIENT_LIGHTNING_BADGES: '雷电徽章不足',
  QIXI_DEW_ACCOUNT_UNAVAILABLE: '当前账号尚未就绪，请稍后重试',
  INVALID_QIXI_DEW_HOST_GID: '农场主人信息无效，请重新选择',
  INVALID_QIXI_DEW_LAND_ID: '地块信息无效，请刷新后重选',
  INVALID_QIXI_DEW_LAND_IDS: '请选择有效地块，单次最多选择 48 块',
  QIXI_DEW_UNAVAILABLE: '活动未进行，鹊羽灵露当前不可使用',
  INSUFFICIENT_QIXI_DEW: '背包中没有可用的鹊羽灵露',
  QIXI_DEW_SELECTION_EXCEEDS_BALANCE: '所选地块数量超过当前鹊羽灵露余额',
  QIXI_DEW_HOST_MISMATCH: '进入的农场与所选好友不一致，请刷新后重试',
  QIXI_DEW_TARGET_UNAVAILABLE: '所选地块已不再可用，请刷新后重选',
  SEASON_UNAVAILABLE: '当前活动数据暂未开放，请稍后刷新重试',
  INVALID_SOLAR_TERM: '节令信息已失效，请刷新页面后重试',
  ACCOUNT_OFFLINE: '当前账号尚未运行，请先启动账号后再试',
  GAME_OFFLINE: '游戏连接尚未就绪，请稍后重试',
  ACTIVITY_TIMEOUT: '活动服务响应超时，请稍后重试',
  ACTIVITY_BUSY: '活动操作过于频繁，请稍后再试',
  ACTIVITY_REQUEST_INTERRUPTED: '活动请求未能完成，请稍后重试',
  ACTIVITY_DATA_CHANGED: '活动数据已经更新，请刷新页面后再试',
  ACTIVITY_OPERATION_FAILED: '活动操作失败，请刷新页面后重试',
}

function errorMessage(error: unknown, fallback = '活动数据加载失败') {
  const candidate = error as { response?: { data?: { error?: unknown, message?: unknown, errorCode?: unknown, errorDetail?: unknown } }, message?: unknown, code?: unknown, detail?: unknown }
  const rawMessage = String(candidate.response?.data?.error || candidate.response?.data?.message || candidate.message || '')
  const errorCode = String(candidate.response?.data?.errorCode || candidate.code || rawMessage.match(/\bcode=(\d+)\b/)?.[1] || '')
  if (activityErrorMessages[errorCode])
    return activityErrorMessages[errorCode]
  // 后端兜底时会带 errorDetail（服务端原始原因）。把 gamepb 前缀和 code= 去掉再展示，
  // 免得用户只看到“活动操作失败，请刷新页面后重试”这种没有任何信息量的文案。
  const detail = String(candidate.response?.data?.errorDetail || candidate.detail || '').replace(/^[\w.]*code=\d+\s*/, '').trim()
  if (detail && !/^活动操作失败/.test(detail))
    return detail
  if (rawMessage.includes('当前无可领取的奖励节点'))
    return activityErrorMessages['1034038']!
  if (rawMessage.includes('当前没有可领取的游记奖励'))
    return activityErrorMessages.NO_PASS_REWARD!
  if (rawMessage.includes('指定节令当前不可领取'))
    return activityErrorMessages.SOLAR_TERM_UNAVAILABLE!
  if (/gamepb\.|code=\d+|GatewayError/.test(rawMessage))
    return fallback
  return rawMessage || fallback
}

function responsePayload(value: unknown): unknown {
  const response = record(value)
  if (response.ok === false) {
    const responseError = new Error(text(response.error, response.message, '活动接口返回失败')) as Error & { code?: string, detail?: string }
    responseError.code = text(response.errorCode, response.error_code, response.code)
    responseError.detail = text(response.errorDetail, response.error_detail)
    throw responseError
  }
  return response.data !== undefined ? response.data : value
}

export const useActivityCenterStore = defineStore('activity-center', () => {
  const snapshot = ref<ActivityCenterSnapshotDto>(normalizeActivitySnapshot({}))
  const loading = ref(false)
  const error = ref('')
  const actionError = ref('')
  const notice = ref('')
  const loadedAccountId = ref('')
  const serverClockOffset = ref(0)
  const requestVersion = ref(0)
  const pendingLoads = new Map<string, Promise<boolean>>()
  const pendingActions = ref<Record<ActivityMutationKey, boolean>>({
    claimPass: false,
    lightConstellation: false,
    claimSolar: false,
    exchange: false,
    claimQixiBridge: false,
    giftQixiSachet: false,
    claimQingMeiSeed: false,
    startQingMeiBrew: false,
    continueQingMeiBrew: false,
    settleQingMeiBrew: false,
    claimCharitySeeds: false,
    donateCharityLove: false,
    claimCharityDailyGift: false,
    claimCharityProgress: false,
    lightWeatherResearch: false,
    buyWeatherBottle: false,
    scanWeatherFriends: false,
    collectWeatherBottle: false,
    summonWeatherRain: false,
    claimYishuHuanfuSeed: false,
    exchangeYishuHuanfuGoods: false,
    sellYishuHuanfuSweetPotato: false,
    shareYishuHuanfuShop: false,
    refreshYishuHuanfuQuote: false,
    claimYishuHuanfuCommission: false,
  })

  const weatherFriends = ref<WeatherFriendDto[]>([])
  const weatherFriendsLoading = ref(false)
  const weatherFriendInspectingGid = ref('')

  // 好友铺子比价是独立命令（cmd 92 批量扫描），不进快照，避免每次刷新都扫一遍好友。
  const yishuHuanfuFriendShops = ref<YishuHuanfuFriendShopDto[]>([])
  const yishuHuanfuFriendShopsLoading = ref(false)
  const yishuHuanfuFriendScanAt = ref(0)
  const yishuHuanfuFriendScanNote = ref('')
  // 收购记录（cmd 95）是独立查询，不放在快照里，避免每次轮询都多打一次网关。
  // recordsAccountId 记录这份列表属于哪个账号：切号时必须整份丢掉，否则会把上一个账号的
  // 记录当成当前账号的显示（页面守卫还会因为「已有数据」直接跳过请求）。
  const yishuHuanfuRecords = ref<YishuHuanfuRecordDto[]>([])
  const yishuHuanfuRecordsLoading = ref(false)
  const yishuHuanfuRecordsNote = ref('')
  const yishuHuanfuRecordsAccountId = ref('')
  const yishuHuanfuRecordsLoaded = ref(false)
  // 比价结果同理：好友列表是按账号取的，切号后旧列表必须清掉。
  const yishuHuanfuFriendShopsAccountId = ref('')

  const season = computed(() => snapshot.value.season)
  const activities = computed(() => snapshot.value.activities)
  const shop = computed(() => snapshot.value.shop)
  const solarTerms = computed(() => snapshot.value.solarTerms)
  const solar = solarTerms
  const constellation = computed(() => snapshot.value.constellation)
  const qixi = computed(() => snapshot.value.qixi)
  const qingMei = computed(() => snapshot.value.qingMei)
  const yishuHuanfu = computed(() => snapshot.value.yishuHuanfu)
  const charity = computed(() => snapshot.value.charity)
  const weather = computed<WeatherActivityDto | null>(() => {
    const value = snapshot.value.weather
    return value ? { ...value, friends: weatherFriends.value } : null
  })
  const actions = computed(() => snapshot.value.actions)
  const serverNow = computed(() => Date.now() + serverClockOffset.value)
  const tabBadges = computed<Partial<Record<ActivityTabKey, boolean>>>(() => ({
    travel: actions.value.claimPass.available,
    constellation: actions.value.lightConstellation.available,
    solar: actions.value.claimSolar.available,
    weather: !!snapshot.value.weather?.actions.research.available,
  }))

  function clearWeatherFriends() {
    weatherFriends.value = []
    weatherFriendsLoading.value = false
    weatherFriendInspectingGid.value = ''
  }

  function reset() {
    requestVersion.value += 1
    clearYishuHuanfuFriendShops()
    // 收购记录也属于具体账号，整份重置时一起清掉，避免切号后残留。
    clearYishuHuanfuRecords()
    snapshot.value = normalizeActivitySnapshot({})
    loading.value = false
    error.value = ''
    actionError.value = ''
    notice.value = ''
    loadedAccountId.value = ''
    serverClockOffset.value = 0
    clearWeatherFriends()
    pendingActions.value = { claimPass: false, lightConstellation: false, claimSolar: false, exchange: false, claimQixiBridge: false, giftQixiSachet: false, claimQingMeiSeed: false, startQingMeiBrew: false, continueQingMeiBrew: false, settleQingMeiBrew: false, claimCharitySeeds: false, donateCharityLove: false, claimCharityDailyGift: false, claimCharityProgress: false, lightWeatherResearch: false, buyWeatherBottle: false, scanWeatherFriends: false, collectWeatherBottle: false, summonWeatherRain: false, claimYishuHuanfuSeed: false, sellYishuHuanfuSweetPotato: false, shareYishuHuanfuShop: false, exchangeYishuHuanfuGoods: false, refreshYishuHuanfuQuote: false, claimYishuHuanfuCommission: false }
  }

  function clearActionMessages() {
    actionError.value = ''
    notice.value = ''
  }

  function isCurrent(version: number, accountId: string) {
    const storedAccountId = typeof localStorage === 'undefined' ? accountId : String(localStorage.getItem('current_account_id') || '')
    return requestVersion.value === version && storedAccountId === accountId
  }

  function applySnapshot(value: unknown, clientStartedAt = Date.now()) {
    const normalized = normalizeActivitySnapshot(value)
    snapshot.value = normalized
    const serverTime = [normalized.serverTime, normalized.season?.serverTime, normalized.shop?.serverTime, normalized.solarTerms?.serverTime, normalized.constellation?.serverTime, normalized.qixi?.serverTime, normalized.charity?.serverTime, normalized.weather?.serverTime]
      .find(value => value !== null && value !== undefined)
    if (serverTime !== undefined && serverTime !== null)
      serverClockOffset.value = serverTime - Math.round((clientStartedAt + Date.now()) / 2)
  }

  async function fetchSnapshot(accountId: string) {
    const response = await api.get('/api/activity-center/activities', {
      headers: { 'x-account-id': accountId },
      skipErrorToast: true,
    } as any)
    return responsePayload(response.data)
  }

  async function loadDetails(accountId: string, gameplayKey: ActivityGameplayKey) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId)
      return false
    const version = ++requestVersion.value
    const clientStartedAt = Date.now()
    loading.value = true
    error.value = ''
    try {
      let detail: unknown
      let detailKey: 'season' | 'qixi' | 'qingMei' | 'charity' | 'weather' | 'yishuHuanfu' | null = null
      if (gameplayKey === 'qixi') {
        const response = await api.get('/api/activity-center/qixi', { headers: { 'x-account-id': requestedAccountId }, skipErrorToast: true } as any)
        detail = responsePayload(response.data)
        detailKey = 'qixi'
      }
      else if (gameplayKey === 'qingmei') {
        const response = await api.get('/api/activity-center/qingmei', { headers: { 'x-account-id': requestedAccountId }, skipErrorToast: true } as any)
        detail = responsePayload(response.data)
        detailKey = 'qingMei'
      }
      else if (gameplayKey === 'yishuhuanfu') {
        const response = await api.get('/api/activity-center/yishuhuanfu', { headers: { 'x-account-id': requestedAccountId }, skipErrorToast: true } as any)
        detail = responsePayload(response.data)
        detailKey = 'yishuHuanfu'
      }
      else if (gameplayKey === 'charity') {
        const response = await api.get('/api/activity-center/charity-red-flower', { headers: { 'x-account-id': requestedAccountId }, skipErrorToast: true } as any)
        detail = responsePayload(response.data)
        detailKey = 'charity'
      }
      else if (gameplayKey === 'weather') {
        const response = await api.get('/api/activity-center/weather', { headers: { 'x-account-id': requestedAccountId }, skipErrorToast: true } as any)
        detail = responsePayload(response.data)
        detailKey = 'weather'
      }
      else {
        const response = await api.get('/api/activity-center/stellar', { headers: { 'x-account-id': requestedAccountId }, skipErrorToast: true } as any)
        detail = responsePayload(response.data)
      }
      if (!isCurrent(version, requestedAccountId))
        return false
      if (detailKey) {
        const current = record(snapshot.value)
        if (detailKey === 'yishuHuanfu')
          detail = keepCatalogOnRefresh(record(current.yishuHuanfu), detail)
        applySnapshot({ ...current, [detailKey]: detail }, clientStartedAt)
      }
      else {
        const current = record(snapshot.value)
        applySnapshot({ ...current, ...record(detail), activities: snapshot.value.activities }, clientStartedAt)
      }
      return true
    }
    catch (detailError) {
      if (isCurrent(version, requestedAccountId))
        error.value = errorMessage(detailError)
      return false
    }
    finally {
      if (requestVersion.value === version)
        loading.value = false
    }
  }

  async function performLoad(requestedAccountId: string, force: boolean) {
    if (!force && loadedAccountId.value === requestedAccountId)
      return true

    const version = ++requestVersion.value
    const clientStartedAt = Date.now()
    loading.value = true
    error.value = ''
    actionError.value = ''
    notice.value = ''
    if (loadedAccountId.value !== requestedAccountId) {
      snapshot.value = normalizeActivitySnapshot({})
      loadedAccountId.value = ''
      serverClockOffset.value = 0
      clearWeatherFriends()
      // 好友比价池是后端汇总的面板全账号好友、报价与当前账号无关；收购记录则由
      // loadYishuHuanfuRecords() 内部的 accountId 守卫在换号时清理并重拉，这里无需清空。
    }

    try {
      const value = await fetchSnapshot(requestedAccountId)
      if (!isCurrent(version, requestedAccountId))
        return false
      applySnapshot(value, clientStartedAt)
      loadedAccountId.value = requestedAccountId
      return true
    }
    catch (loadError) {
      if (isCurrent(version, requestedAccountId)) {
        error.value = errorMessage(loadError)
        loadedAccountId.value = requestedAccountId
      }
      return false
    }
    finally {
      if (requestVersion.value === version)
        loading.value = false
    }
  }

  function load(accountId: string, force = false) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId) {
      reset()
      error.value = '请先选择账号'
      return Promise.resolve(false)
    }
    const pending = pendingLoads.get(requestedAccountId)
    if (pending)
      return pending

    const request = performLoad(requestedAccountId, force)
    pendingLoads.set(requestedAccountId, request)
    void request.finally(() => {
      if (pendingLoads.get(requestedAccountId) === request)
        pendingLoads.delete(requestedAccountId)
    })
    return request
  }

  async function mutate(key: ActivityMutationKey, path: string, accountId: string, payload: ActivityRecord = {}, options: { silentSuccess?: boolean, timeoutMs?: number } = {}) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId || pendingActions.value[key])
      return false
    const version = requestVersion.value
    pendingActions.value[key] = true
    actionError.value = ''
    notice.value = ''
    try {
      const response = await api.post(`/api/activity-center${path}`, payload, {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
        ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
      } as any)
      const result = responsePayload(response.data)
      if (!isCurrent(version, requestedAccountId))
        return false
      const resultRecord = record(result)
      if (path.startsWith('/weather/')) {
        const mutationFriend = record(resultRecord.friend)
        if (Object.keys(mutationFriend).length > 0)
          mergeWeatherFriends([normalizeWeatherFriend(mutationFriend)])
        const mutationFriends = records(resultRecord.friends)
        if (mutationFriends.length > 0)
          mergeWeatherFriends(mutationFriends.map(normalizeWeatherFriend))
      }
      const mutationSnapshot = first(resultRecord.snapshot, resultRecord.activityCenter, resultRecord.activity_center)
      if (mutationSnapshot) {
        const mutationRecord = record(mutationSnapshot)
        if (path.startsWith('/weather/') && !Object.prototype.hasOwnProperty.call(mutationRecord, 'weather')) {
          const current = record(snapshot.value)
          applySnapshot({ ...current, weather: mutationSnapshot })
        }
        else if (path.startsWith('/charity-red-flower/') && !Object.prototype.hasOwnProperty.call(mutationRecord, 'charity')) {
          const current = record(snapshot.value)
          const charityActions = record(mutationRecord.actions)
          applySnapshot({
            ...current,
            charity: mutationSnapshot,
            actions: {
              ...record(current.actions),
              charityClaimSeeds: charityActions.claimSeeds,
              charityDonateLove: charityActions.donateLove,
              charityClaimDailyGift: charityActions.claimDailyGift,
            },
          })
        }
        else {
          // 写操作回包里的活动快照同样不带 cmd 97 目录，保留上一次已加载的档位。
          const previousDetail = record(record(snapshot.value).yishuHuanfu)
          const nextRecord = record(mutationSnapshot)
          if (Object.prototype.hasOwnProperty.call(nextRecord, 'yishuHuanfu')) {
            applySnapshot({
              ...nextRecord,
              yishuHuanfu: keepCatalogOnRefresh(previousDetail, nextRecord.yishuHuanfu),
            })
          }
          else {
            applySnapshot(mutationSnapshot)
          }
        }
      }
      else {
        await load(requestedAccountId, true)
      }
      if (key === 'claimCharityProgress') {
        const claimedTarget = text(resultRecord.target)
        const currentCharity = snapshot.value.charity
        if (claimedTarget && currentCharity) {
          snapshot.value = {
            ...snapshot.value,
            charity: {
              ...currentCharity,
              progressRewards: currentCharity.progressRewards.map(reward => reward.target === claimedTarget
                ? { ...reward, claimed: true, claimable: false }
                : reward),
            },
          }
        }
      }
      const rewards = records(resultRecord.rewards).map(normalizeItem).filter(item => item.id || item.name)
      const rewardSummary = rewards.map(item => `${item.name || item.id}${item.count ? ` ×${item.count}` : ''}`).join('、')
      if (!options.silentSuccess)
        notice.value = text(resultRecord.message, record(response.data).message, rewardSummary ? `获得 ${rewardSummary}` : '操作成功')
      return resultRecord
    }
    catch (mutationError) {
      if (isCurrent(version, requestedAccountId))
        actionError.value = errorMessage(mutationError, '活动操作失败')
      return false
    }
    finally {
      pendingActions.value[key] = false
    }
  }

  function claimPass(accountId: string) {
    return mutate('claimPass', '/pass/claim', accountId)
  }

  function lightConstellation(accountId: string) {
    return mutate('lightConstellation', '/constellation/light', accountId)
  }

  function claimSolarTerm(accountId: string, termId: string) {
    return mutate('claimSolar', `/solar-terms/${encodeURIComponent(termId)}/claim`, accountId)
  }

  function exchangeStarSandGoods(accountId: string, goodsId: string, count: number) {
    return mutate('exchange', '/shop/exchange', accountId, { goodsId, count })
  }

  function claimQixiBridgeRewards(accountId: string) {
    return mutate('claimQixiBridge', '/qixi/bridge/claim', accountId)
  }

  function claimYishuHuanfuSeeds(accountId: string) {
    return mutate('claimYishuHuanfuSeed', '/yishuhuanfu/seed/claim', accountId)
  }

  // 不传 friendGid 时卖给自己铺子，传了则占用对方每日接收额度；count 缺省卖出背包全部。
  function sellYishuHuanfuSweetPotato(accountId: string, friendGid = '', count: number | null = null) {
    const payload: Record<string, unknown> = {}
    if (friendGid)
      payload.friendGid = friendGid
    if (count !== null && Number.isFinite(count) && count > 0)
      payload.count = Math.floor(count)
    return mutate('sellYishuHuanfuSweetPotato', '/yishuhuanfu/sell', accountId, payload)
  }

  function shareYishuHuanfuShop(accountId: string) {
    return mutate('shareYishuHuanfuShop', '/yishuhuanfu/share', accountId)
  }

  // 领取收购提成（cmd 99）。提成只来自“好友把蜜薯卖进你的铺子”，自己卖自己不产生。
  function claimYishuHuanfuCommission(accountId: string) {
    return mutate('claimYishuHuanfuCommission', '/yishuhuanfu/commission/claim', accountId)
  }

  // 收购记录列表（cmd 95）。独立查询、不进快照，避免每次轮询多打一次网关。
  // 列表按账号隔离：换账号先同步清空再请求，旧账号的迟到回包直接丢弃。
  // force=true 用于进页面/手动刷新；不带 force 时同一账号已加载过就不再打网关。
  async function loadYishuHuanfuRecords(accountId: string, force = false) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId)
      return false
    if (yishuHuanfuRecordsAccountId.value !== requestedAccountId)
      clearYishuHuanfuRecords()
    yishuHuanfuRecordsAccountId.value = requestedAccountId
    // 同一账号的请求还在路上，别叠加第二个。
    if (yishuHuanfuRecordsLoading.value)
      return false
    if (!force && yishuHuanfuRecordsLoaded.value)
      return true
    yishuHuanfuRecordsLoading.value = true
    try {
      const response = await api.get('/api/activity-center/yishuhuanfu/records', {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
      } as any)
      const payload = record(responsePayload(response.data))
      // 请求期间又切了账号：这份回包属于上一个账号，写进去就是串号。
      if (yishuHuanfuRecordsAccountId.value !== requestedAccountId)
        return false
      yishuHuanfuRecords.value = records(payload.records).map(entry => ({
        timestamp: text(entry.timestamp),
        gid: text(entry.gid),
        count: text(entry.count),
        total: text(entry.total),
        name: text(entry.name),
        avatar: text(entry.avatar),
        level: text(entry.level),
        commission: text(entry.commission),
      }))
      yishuHuanfuRecordsNote.value = text(payload.message)
      yishuHuanfuRecordsLoaded.value = true
      return true
    } catch (error) {
      if (yishuHuanfuRecordsAccountId.value === requestedAccountId)
        yishuHuanfuRecordsNote.value = errorMessage(error, '收购记录加载失败')
      return false
    } finally {
      // 只有仍然属于这个账号时才关掉 loading，避免旧请求把新账号的加载态提前结束。
      if (yishuHuanfuRecordsAccountId.value === requestedAccountId)
        yishuHuanfuRecordsLoading.value = false
    }
  }

  function clearYishuHuanfuRecords() {
    yishuHuanfuRecords.value = []
    yishuHuanfuRecordsLoading.value = false
    yishuHuanfuRecordsNote.value = ''
    yishuHuanfuRecordsLoaded.value = false
    yishuHuanfuRecordsAccountId.value = ''
  }

  // 刷新本人铺子的今日行情（cmd 92）。旧实现打的是 cmd 95，而 95 其实是收购记录列表，
  // 回包不带行情字段，所以这个按钮以前点了没反应。
  function refreshYishuHuanfuQuote(accountId: string) {
    return mutate('refreshYishuHuanfuQuote', '/yishuhuanfu/quote/refresh', accountId)
  }

  // 兑换下单：index 是目录序号，count 是数量。
  function exchangeYishuHuanfuGoods(accountId: string, index: number, count = 1) {
    return mutate('exchangeYishuHuanfuGoods', '/yishuhuanfu/exchange', accountId, { index, count })
  }

  // 目录是独立命令，进入活动页时单独拉一次，并把结果并回当前快照。
  // 每次都真打一次 cmd 97：价格与剩余次数会随当日行情变，缓存住反而展示旧价。
  async function loadYishuHuanfuCatalog(accountId: string) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId)
      return false
    try {
      const response = await api.get('/api/activity-center/yishuhuanfu/catalog', {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
      } as any)
      const payload = record(responsePayload(response.data))
      const current = record(snapshot.value)
      const detail = record(current.yishuHuanfu)
      if (Object.keys(detail).length === 0)
        return false
      const catalog = records(payload.catalog).map(entry => ({
        index: finiteNumber(first(entry.index)) || 0,
        itemId: entry.itemId === null || entry.itemId === undefined ? null : text(entry.itemId),
        name: text(entry.name),
        nameKnown: bool(entry.nameKnown, entry.name_known),
        price: text(entry.price),
        status: finiteNumber(first(entry.status)) || 0,
        limit: text(entry.limit),
        exchangedToday: text(entry.exchangedToday, entry.exchanged_today),
        image: text(entry.image),
        exchangeable: bool(entry.exchangeable),
      }))
      const actions = record(detail.actions)
      const exchangeEnabled = catalog.length > 0 && bool(first(detail.active))
      applySnapshot({
        ...current,
        yishuHuanfu: {
          ...detail,
          catalog,
          catalogLoaded: true,
          actions: {
            ...actions,
            exchange: {
              ...record(actions.exchange),
              enabled: exchangeEnabled,
              available: exchangeEnabled,
              availabilityKnown: true,
            },
          },
        },
      })
      return true
    } catch {
      return false
    }
  }

  function giftQixiSachet(accountId: string, friendGid: string, messageTextId = 15) {
    return mutate('giftQixiSachet', '/qixi/gift', accountId, { friendGid, messageTextId })
  }

  /**
   * 查任意 GID 的铺子行情（cmd 92）。好友列表里的铺子本来就是这条命令查出来的，
   * 这里只是放开「手动填 GID」——蜜薯能卖给陌生人，不需要先加好友。
   * 返回结构与好友比价列表一致，界面可以复用同一套额度/单价渲染。
   */
  async function queryYishuHuanfuShopQuote(accountId: string, gid: string): Promise<YishuHuanfuFriendShopDto | null> {
    const requestedAccountId = String(accountId || '').trim()
    const targetGid = String(gid || '').trim()
    if (!requestedAccountId || !targetGid)
      return null
    const response = await api.get('/api/activity-center/yishuhuanfu/shop', {
      headers: { 'x-account-id': requestedAccountId },
      params: { friendGid: targetGid },
      skipErrorToast: true,
    } as any)
    const payload = record(responsePayload(response.data))
    const shop = record(payload.shop)
    const price = text(payload.price)
    const bonus = text(payload.bonus)
    const totalPrice = text(payload.totalPrice, payload.total_price, price)
    return {
      gid: text(shop.gid, payload.targetGid, targetGid),
      name: text(shop.name),
      avatar: text(shop.avatar),
      level: text(shop.level),
      own: bool(payload.own),
      price,
      bonus,
      totalPrice,
      quota: text(payload.quota),
      quotaCap: text(payload.quotaCap, payload.quota_cap),
      quotaUsed: text(payload.quotaUsed, payload.quota_used),
      canSell: payload.canSell === null || payload.canSell === undefined ? null : bool(payload.canSell, payload.can_sell),
      unlimited: bool(payload.own),
      via: 'friend',
      panelAccount: '',
    }
  }

  // 把自己铺子的剩余接收额度（cmd 92）并回快照，供进度条展示。
  async function loadYishuHuanfuShop(accountId: string) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId)
      return false
    try {
      const response = await api.get('/api/activity-center/yishuhuanfu/shop', {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
      } as any)
      const payload = record(responsePayload(response.data))
      const current = record(snapshot.value)
      const detail = record(current.yishuHuanfu)
      if (Object.keys(detail).length === 0)
        return false
      const quota = payload.quota === null || payload.quota === undefined ? null : text(payload.quota)
      if (quota === null)
        return false
      const shop = record(detail.shop)
      applySnapshot({
        ...current,
        yishuHuanfu: {
          ...detail,
          shop: {
            ...shop,
            quota,
            quotaCap: text(payload.quotaCap, payload.quota_cap, text(shop.quotaCap)),
            quotaUsed: payload.quotaUsed === null || payload.quotaUsed === undefined
              ? null
              : text(payload.quotaUsed),
          },
        },
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * 好友铺子比价：把好友列表逐个丢给 cmd 92 查今日收购价。
   * force 为真时跳过后端 3 分钟缓存，用于手动刷新。
   */
  async function scanYishuHuanfuFriendShops(accountId: string, force = false) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId || yishuHuanfuFriendShopsLoading.value)
      return false
    // 换账号先清空上一个账号的比价结果（同步执行，界面上不会闪别人的好友）。
    if (yishuHuanfuFriendShopsAccountId.value !== requestedAccountId)
      clearYishuHuanfuFriendShops()
    yishuHuanfuFriendShopsAccountId.value = requestedAccountId
    yishuHuanfuFriendShopsLoading.value = true
    try {
      const response = await api.get('/api/activity-center/yishuhuanfu/friends', {
        headers: { 'x-account-id': requestedAccountId },
        params: force ? { force: 1 } : {},
        skipErrorToast: true,
      } as any)
      const payload = record(responsePayload(response.data))
      // 扫描期间切了账号：这份结果属于上一个账号，丢掉。
      if (yishuHuanfuFriendShopsAccountId.value !== requestedAccountId)
        return false
      yishuHuanfuFriendShops.value = records(payload.shops).map((entry) => {
        const price = text(entry.price)
        const bonus = text(entry.bonus)
        // 后端会给 totalPrice；老版本后端没有时按基础价 + 加成兜底，别退回只显示基础价。
        const totalPrice = text(entry.totalPrice, entry.total_price)
          || String(Number(price || '0') + Number(bonus || '0'))
        return {
          gid: text(entry.gid),
          name: text(entry.name),
          avatar: text(entry.avatar),
          level: text(entry.level),
          own: bool(entry.own),
          price,
          bonus,
          totalPrice,
          quota: text(entry.quota),
          quotaCap: text(entry.quotaCap, entry.quota_cap),
          quotaUsed: text(entry.quotaUsed, entry.quota_used),
          // can_sell 是三态：缺字段时保持 null（按可卖处理），只有明确 false 才禁卖。
          canSell: entry.canSell === undefined || entry.canSell === null
            ? null
            : bool(entry.canSell, entry.can_sell),
          // 自家铺子不占好友额度，界面固定显示「不限」。
          unlimited: bool(entry.unlimited) || bool(entry.own),
          via: (text(entry.via) || (bool(entry.own) ? 'own' : 'friend')) as 'own' | 'friend' | 'panel',
          panelAccount: text(entry.panelAccount, entry.panel_account),
        }
      })
      yishuHuanfuFriendScanAt.value = finiteNumber(first(payload.scannedAt, payload.scanned_at)) || Date.now()
      const scanned = finiteNumber(first(payload.scanned)) || 0
      const failed = finiteNumber(first(payload.failed)) || 0
      const friendListError = text(payload.friendListError, payload.friend_list_error)
      const panelFriendCount = finiteNumber(first(payload.panelFriendCount, payload.panel_friend_count)) || 0
      const pendingCount = finiteNumber(first(payload.pendingCount, payload.pending_count)) || 0
      yishuHuanfuFriendScanNote.value = friendListError
        || (scanned === 0
          ? '没有可查询的铺子'
          : `已扫描 ${yishuHuanfuFriendShops.value.length} 个铺子`
            + `${panelFriendCount ? `（含其它账号好友 ${panelFriendCount} 个）` : ''}`
            + `${failed ? `，${failed} 个查询失败` : ''}`
            + `${pendingCount ? `，还有 ${pendingCount} 个候选待下一轮轮换` : ''}`)
      return true
    } catch (scanError) {
      if (yishuHuanfuFriendShopsAccountId.value === requestedAccountId)
        yishuHuanfuFriendScanNote.value = errorMessage(scanError, '好友铺子比价失败')
      return false
    } finally {
      if (yishuHuanfuFriendShopsAccountId.value === requestedAccountId)
        yishuHuanfuFriendShopsLoading.value = false
    }
  }

  function clearYishuHuanfuFriendShops() {
    yishuHuanfuFriendShops.value = []
    yishuHuanfuFriendShopsLoading.value = false
    yishuHuanfuFriendScanAt.value = 0
    yishuHuanfuFriendScanNote.value = ''
    yishuHuanfuFriendShopsAccountId.value = ''
  }

  function claimQingMeiDailySeed(accountId: string) {
    return mutate('claimQingMeiSeed', '/qingmei/daily-seed/claim', accountId)
  }

  function startQingMeiBrew(accountId: string, ingredients: Array<{ uid: string, count: number }>) {
    return mutate('startQingMeiBrew', '/qingmei/brew/start', accountId, { ingredients })
  }

  function continueQingMeiBrew(accountId: string) {
    return mutate('continueQingMeiBrew', '/qingmei/brew/continue', accountId)
  }

  function settleQingMeiBrew(accountId: string) {
    return mutate('settleQingMeiBrew', '/qingmei/brew/settle', accountId)
  }

  function claimCharityRedFlowerSeeds(accountId: string) {
    return mutate('claimCharitySeeds', '/charity-red-flower/seeds/claim', accountId)
  }

  function donateCharityRedFlowerLove(accountId: string) {
    return mutate('donateCharityLove', '/charity-red-flower/love/donate', accountId)
  }

  function claimCharityRedFlowerDailyGift(accountId: string) {
    return mutate('claimCharityDailyGift', '/charity-red-flower/daily-gift/claim', accountId)
  }

  function claimCharityRedFlowerProgressReward(accountId: string, target: string) {
    return mutate('claimCharityProgress', '/charity-red-flower/progress/claim', accountId, { target })
  }

  function lightWeatherResearch(accountId: string, nodeId: string) {
    return mutate('lightWeatherResearch', '/weather/research/light', accountId, { nodeId })
  }

  function buyWeatherBottle(accountId: string, count = 1) {
    return mutate('buyWeatherBottle', '/weather/bottle/buy', accountId, { count })
  }

  async function loadWeatherFriends(accountId: string) {
    const requestedAccountId = String(accountId || '').trim()
    if (!requestedAccountId)
      return false
    const version = requestVersion.value
    weatherFriendsLoading.value = true
    try {
      const response = await api.get('/api/activity-center/weather/friends', {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
      } as any)
      const payload = responsePayload(response.data)
      if (!isCurrent(version, requestedAccountId))
        return false
      weatherFriends.value = records(Array.isArray(payload) ? payload : record(payload).friends).map(normalizeWeatherFriend)
      return true
    }
    catch (loadError) {
      if (isCurrent(version, requestedAccountId))
        actionError.value = errorMessage(loadError, '好友天气列表加载失败')
      return false
    }
    finally {
      weatherFriendsLoading.value = false
    }
  }

  function mergeWeatherFriends(updates: WeatherFriendDto[]) {
    if (updates.length === 0)
      return
    const updateMap = new Map(updates.map(friend => [friend.gid, friend]))
    const current = weatherFriends.value
    for (let index = 0; index < current.length; index += 1) {
      const update = updateMap.get(current[index]!.gid)
      if (!update)
        continue
      current[index] = update
      updateMap.delete(update.gid)
    }
  }

  /**
   * 点击好友时读取这位好友的现场天气：只发一次单人扫描请求，后端命中 10 分钟缓存时不会进农场。
   * 后端给好友任务让路时回包里没有这位好友，此时保持原状态并提示稍后再点。
   */
  async function inspectWeatherFriend(accountId: string, friendGid: string) {
    const requestedAccountId = String(accountId || '').trim()
    const gid = String(friendGid || '').trim()
    if (!requestedAccountId || !gid || Number(gid) <= 0)
      return false
    if (pendingActions.value.scanWeatherFriends)
      return false
    const version = requestVersion.value
    pendingActions.value.scanWeatherFriends = true
    weatherFriendInspectingGid.value = gid
    actionError.value = ''
    notice.value = ''
    try {
      const response = await api.post('/api/activity-center/weather/friends/scan', { friendGids: [gid] }, {
        headers: { 'x-account-id': requestedAccountId },
        skipErrorToast: true,
        timeout: 60000,
      } as any)
      const result = record(responsePayload(response.data))
      if (!isCurrent(version, requestedAccountId))
        return false
      const updates = records(result.friends).map(normalizeWeatherFriend)
      mergeWeatherFriends(updates)
      if (updates.length === 0) {
        notice.value = '好友任务正在执行，请稍后再点这位好友'
        return false
      }
      return true
    }
    catch (inspectError) {
      if (isCurrent(version, requestedAccountId))
        actionError.value = errorMessage(inspectError, '好友现场天气读取失败')
      return false
    }
    finally {
      if (weatherFriendInspectingGid.value === gid)
        weatherFriendInspectingGid.value = ''
      pendingActions.value.scanWeatherFriends = false
    }
  }

  function collectWeatherBottle(accountId: string, targetGid: string) {
    return mutate('collectWeatherBottle', '/weather/bottle/collect', accountId, { targetGid })
  }

  function summonWeatherRain(accountId: string) {
    return mutate('summonWeatherRain', '/weather/rain/summon', accountId)
  }

  function lazyLoad(accountId: string) {
    return load(accountId, false)
  }

  function refresh(accountId: string) {
    return load(accountId, true)
  }

  return {
    snapshot,
    activities,
    season,
    shop,
    solar,
    solarTerms,
    constellation,
    qixi,
    qingMei,
    yishuHuanfu,
    yishuHuanfuFriendShops,
    yishuHuanfuFriendShopsLoading,
    yishuHuanfuFriendScanAt,
    yishuHuanfuFriendScanNote,
    charity,
    weather,
    weatherFriends,
    weatherFriendsLoading,
    weatherFriendInspectingGid,
    actions,
    tabBadges,
    loading,
    error,
    actionError,
    notice,
    loadedAccountId,
    serverClockOffset,
    serverNow,
    pendingActions,
    lazyLoad,
    refresh,
    loadDetails,
    loadWeatherFriends,
    claimPass,
    lightConstellation,
    claimSolarTerm,
    exchangeStarSandGoods,
    claimQixiBridgeRewards,
    giftQixiSachet,
    claimYishuHuanfuSeeds,
    sellYishuHuanfuSweetPotato,
    shareYishuHuanfuShop,
    refreshYishuHuanfuQuote,
    exchangeYishuHuanfuGoods,
    loadYishuHuanfuCatalog,
    loadYishuHuanfuShop,
    queryYishuHuanfuShopQuote,
    loadYishuHuanfuRecords,
    claimYishuHuanfuCommission,
    yishuHuanfuRecords,
    yishuHuanfuRecordsLoading,
    yishuHuanfuRecordsNote,
    clearYishuHuanfuRecords,
    scanYishuHuanfuFriendShops,
    clearYishuHuanfuFriendShops,
    claimQingMeiDailySeed,
    startQingMeiBrew,
    continueQingMeiBrew,
    settleQingMeiBrew,
    claimCharityRedFlowerSeeds,
    donateCharityRedFlowerLove,
    claimCharityRedFlowerDailyGift,
    claimCharityRedFlowerProgressReward,
    lightWeatherResearch,
    buyWeatherBottle,
    inspectWeatherFriend,
    collectWeatherBottle,
    summonWeatherRain,
    clearActionMessages,
    reset,
  }
})
