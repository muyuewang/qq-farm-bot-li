import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// 仓库统一用 Node 内置 runner。
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')

// 2026-11-28 晚：铺主重新分享会让旧链接作废，服务端回 1034184。
// 后端会删掉那条死链，并把「哪几家失效」放进 expiredShops 下发。
// 界面必须把它和「查询失败」分开讲：前者点重试没用，得等对方重新分享。
const api = {
  get: async () => ({ data: { ok: true, data: {} } }),
  post: async () => ({ data: { ok: true } }),
}

function loadStoreModule() {
  const imports = { '@/api': { __esModule: true, default: api } }
  const source = readFileSync(new URL('../src/stores/activity-center.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(id => imports[id] || require(id), module, module.exports)
  return module.exports
}

const { useActivityCenterStore } = loadStoreModule()

function freshStore() {
  setActivePinia(createPinia())
  return useActivityCenterStore()
}

test('扫描结果里的失效铺子会被单独记下来并写进提示', async () => {
  const store = freshStore()
  api.get = async () => ({
    data: {
      ok: true,
      data: {
        shops: [{
          gid: '1220537209',
          own: true,
          name: '我的铺子',
          totalPrice: '100',
          price: '100',
          bonus: '0',
          quota: '8000',
          shareKey: 'f0000001-0000-4000-8000-000000000001',
        }],
        scanned: 2,
        failed: 0,
        expiredShops: [{ gid: '910001', name: 'A号' }],
        expiredKeyCount: 1,
        panelFriendCount: 1,
        pendingCount: 0,
        scannedAt: Date.now(),
      },
    },
  })

  const ok = await store.scanYishuHuanfuFriendShops('acc-1', true)
  assert.equal(ok, true)
  assert.deepEqual(store.yishuHuanfuExpiredShops, [{ gid: '910001', name: 'A号' }])
  assert.match(store.yishuHuanfuFriendScanNote, /1 家分享链接失效已移出/)
})

test('切换账号会清掉上一个账号的失效名单', async () => {
  const store = freshStore()
  api.get = async () => ({
    data: {
      ok: true,
      data: {
        shops: [],
        scanned: 1,
        expiredShops: [{ gid: '910001', name: 'A号' }],
        expiredKeyCount: 1,
        scannedAt: Date.now(),
      },
    },
  })
  await store.scanYishuHuanfuFriendShops('acc-1', true)
  assert.equal(store.yishuHuanfuExpiredShops.length, 1)

  // 换号时先 clear：不能把上一个号看到的名字留在界面上。
  store.clearYishuHuanfuFriendShops()
  assert.deepEqual(store.yishuHuanfuExpiredShops, [])
  assert.equal(store.yishuHuanfuFriendScanNote, '')
})

test('后端没下发 expiredShops 时按空数组处理，不报错', async () => {
  const store = freshStore()
  api.get = async () => ({
    data: { ok: true, data: { shops: [], scanned: 1, expiredKeyCount: 0, scannedAt: Date.now() } },
  })
  const ok = await store.scanYishuHuanfuFriendShops('acc-1', true)
  assert.equal(ok, true)
  assert.deepEqual(store.yishuHuanfuExpiredShops, [])
})
