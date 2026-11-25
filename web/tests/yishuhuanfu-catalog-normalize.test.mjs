import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// This repository runs its tests with Node's built-in runner.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')

// Load the real activity-center store module; only the HTTP layer is replaced.
function loadStoreModule() {
  const imports = {
    '@/api': { __esModule: true, default: { get: async () => ({ data: { ok: true } }), post: async () => ({ data: { ok: true } }) } },
  }
  const source = readFileSync(new URL('../src/stores/activity-center.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(id => imports[id] || require(id), module, module.exports)
  return module.exports
}

const catalogEntry = overrides => ({
  index: 5,
  itemId: '35002',
  name: '有机化肥',
  nameKnown: true,
  price: '8500',
  status: 2,
  limit: '50',
  exchangedToday: '0',
  image: '',
  ...overrides,
})

test('catalog entries keep the server exchangeable flag through snapshot normalization', () => {
  const { normalizeActivitySnapshot } = loadStoreModule()
  const snapshot = normalizeActivitySnapshot({
    yishuHuanfu: {
      activityId: '2026111707',
      active: true,
      luckCoinBalance: '32156',
      catalog: [catalogEntry({ exchangeable: true }), catalogEntry({ index: 6, price: '28000', exchangeable: false })],
      catalogLoaded: true,
    },
  })
  // 之前这里被写死成 false，cmd 97 拉到的目录经 applySnapshot 再归一化后整排变「暂不可兑」。
  assert.equal(snapshot.yishuHuanfu.catalog[0].exchangeable, true)
  assert.equal(snapshot.yishuHuanfu.catalog[1].exchangeable, false)
  assert.equal(snapshot.yishuHuanfu.catalog[0].exchangedToday, '0')
})

test('catalog entries without an exchangeable field stay clickable', () => {
  const { normalizeActivitySnapshot } = loadStoreModule()
  const { exchangeable, ...withoutFlag } = catalogEntry({})
  assert.equal(exchangeable, undefined)
  const snapshot = normalizeActivitySnapshot({ yishuHuanfu: { activityId: '2026111707', active: true, catalog: [withoutFlag] } })
  // 缺字段按可兑处理，价格够不够交给渲染层与下单接口判，避免多一层可能对不上的开关。
  assert.equal(snapshot.yishuHuanfu.catalog[0].exchangeable, true)
})
