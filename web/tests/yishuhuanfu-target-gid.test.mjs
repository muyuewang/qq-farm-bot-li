import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// This repository runs its tests with Node's built-in runner.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'
import { nextTick, reactive } from 'vue'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { parse, compileScript } = require('vue/compiler-sfc')

// 加载真实的组件 setup 逻辑（不是复刻的假实现）：编译 SFC 的 script setup，
// 用 TypeScript 转成 CommonJS 后直接调用 setup，只替换 Vue 之外的依赖。
function loadTabComponent() {
  const filename = new URL('../src/components/activity/YishuHuanfuTab.vue', import.meta.url)
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
  const { content } = compileScript(descriptor, { id: 'yshf-tab-test', inlineTemplate: false })
  const { outputText } = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  // 组件内部会 import 别的 .vue 组件（别名 `@/…` 只有打包器认识），
  // 测试里换成占位实现即可——这些子组件不参与 setup 逻辑的断言。
  const stubRequire = (id) => {
    if (id.startsWith('@/') && id.endsWith('.vue'))
      return { default: { name: 'StubComponent', template: '<div />' } }
    return require(id)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(stubRequire, module, module.exports)
  return module.exports.default
}

function activity(id = '2026110104') {
  return {
    activityId: id,
    shop: {
      gid: '1000000000',
      price: '144',
      bonus: '0',
      priceKnown: true,
      estimatedPrice: '144',
      quota: 50,
      quotaCap: 50,
      quotaUsed: 0,
    },
    sweetPotatoBalance: '20',
    sweetPotatoBalanceKnown: true,
    luckCoinBalance: '30000',
    actions: { sell: { enabled: true }, exchange: { enabled: true } },
    catalog: [],
  }
}

function propsFor(overrides = {}) {
  return {
    activity: activity(),
    pendingSeed: false,
    pendingSell: false,
    pendingShare: false,
    pendingExchange: false,
    pendingQuote: false,
    pendingCommission: false,
    friendShops: [],
    friendShopsLoading: false,
    friendScanAt: 0,
    friendScanNote: '',
    records: [],
    recordsLoading: false,
    recordsNote: '',
    targetQuote: null,
    targetQuoteLoading: false,
    targetQuoteNote: '',
    targetQuoteGid: '',
    ...overrides,
  }
}

function mountTab(overrides = {}) {
  const props = reactive(propsFor(overrides))
  const emitted = []
  const state = loadTabComponent().setup(props, {
    emit: (...args) => emitted.push(args),
    attrs: {},
    slots: {},
    expose() {},
  })
  return { props, state, emitted }
}

test('选中好友铺子后，快照刷新（含 activityId 变化）不会把目标重置为自己', async () => {
  const { props, state } = mountTab({
    friendShops: [{ gid: '1038131761', name: '命', price: '111', bonus: '33', totalPrice: '144', quota: '30', canSell: true }],
  })

  state.pickTarget('1038131761')
  assert.equal(state.targetGid.value, '1038131761')
  assert.equal(state.tab.value, 'shop')
  assert.equal(state.targetLabel.value, '命 的铺子')

  // 模拟轮询/手动刷新：activity 换成全新对象，连 activityId 都变了。
  // 之前组件里 watch([accountId, activityId]) 会在这里把 targetGid 清空，
  // 用户就会看到「卖给他」瞬间变回「卖给自己」。
  props.activity = activity('2026110105')
  await nextTick()

  assert.equal(state.targetGid.value, '1038131761', '刷新后目标应保持不变')
  assert.equal(state.targetLabel.value, '命 的铺子')
  assert.equal(state.unitPrice.value, 144)
})

test('出售目标只由用户交互改变：改回自己和手填 GID 生效，其它状态变化不干扰', async () => {
  const { props, state, emitted } = mountTab()

  // 手填 GID
  state.onGidInput(' 987654321 ')
  assert.equal(state.targetGid.value, '987654321', 'GID 只保留数字')

  // 行情/比价列表刷新不影响目标
  props.friendShops = [{ gid: '555', name: '别人', totalPrice: '165' }]
  props.targetQuote = null
  props.pendingSell = true
  await nextTick()
  assert.equal(state.targetGid.value, '987654321')

  // 主动改回自己
  state.pickTarget('')
  assert.equal(state.targetGid.value, '')
  assert.equal(state.targetLabel.value, '自己的铺子')

  props.pendingSell = false
  emitted.length = 0
  state.submitSell()
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0][1].friendGid, '')
})

test('账号切换由父级 v-if 卸载页面完成，组件内不再需要自动重置 watch', () => {
  const tabSource = readFileSync(new URL('../src/components/activity/YishuHuanfuTab.vue', import.meta.url), 'utf8')
  assert.ok(!/^import[^']*watch/m.test(tabSource), '组件不应再引入 watch')
  assert.ok(!/watch\s*\(/.test(tabSource), '组件不应再有 watch 自动清空出售目标')

  const centerSource = readFileSync(new URL('../src/views/ActivityCenter.vue', import.meta.url), 'utf8')
  assert.match(centerSource, /watch\(currentAccountId, \(\) => \{[\s\S]*?selectedActivity\.value = null/)
  assert.match(centerSource, /YishuHuanfuActivityPage[\s\S]{0,80}v-else-if="selectedActivity === 'yishuhuanfu'"/)
})

test('移出比价要二次确认，确认后才通知父级', () => {
  const { state, emitted } = mountTab()
  const shop = { gid: '900001', name: 'A号', own: false }

  state.askForgetShop(shop)
  assert.equal(state.forgetTarget.value?.gid, '900001')
  assert.equal(emitted.length, 0, '点按钮只弹确认框，不能直接删')

  state.confirmForgetShop()
  assert.equal(state.forgetTarget.value, null, '确认后关闭弹窗')
  assert.deepEqual(emitted.at(-1), ['forgetShop', '900001'])
})

test('自己的铺子不给移出，弹窗不会打开', () => {
  const { state, emitted } = mountTab()
  state.askForgetShop({ gid: '1000000000', name: '自己', own: true })
  assert.equal(state.forgetTarget.value, null)
  assert.equal(emitted.length, 0)
})
