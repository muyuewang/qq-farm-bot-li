import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// 仓库统一用 Node 内置 runner。
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')

// 2026-11-28 晚实测：1034184「分享链接已失效」不是对方链接坏了 —— 当天标识一整天都有效，
// 同一条链接换个账号照样能查能卖，是本账号被限了。后端一条存档都不删，
// 只把「哪几家没查到」放进 blockedShops 下发。界面必须把它和「查询失败」分开讲，
// 并且文案只能指向「换账号再试」，不能引导用户去删那家铺子。
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

test('扫描结果里被风控挡回来的铺子会被单独记下来，提示指向换账号', async () => {
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
        blockedShops: [{ gid: '910001', name: 'A号' }],
        blockedKeyCount: 1,
        panelFriendCount: 1,
        pendingCount: 0,
        scannedAt: Date.now(),
      },
    },
  })

  const ok = await store.scanYishuHuanfuFriendShops('acc-1', true)
  assert.equal(ok, true)
  assert.deepEqual(store.yishuHuanfuBlockedShops, [{ gid: '910001', name: 'A号' }])
  assert.match(store.yishuHuanfuFriendScanNote, /本账号被限 1 家/)
  // 关键：不能说成「对方链接失效」，那是服务端的说辞，会骗用户删掉有效标识。
  assert.doesNotMatch(store.yishuHuanfuFriendScanNote, /链接失效已移出/)
})

test('切换账号会清掉上一个账号的风控名单（比价缓存按账户来）', async () => {
  const store = freshStore()
  api.get = async () => ({
    data: {
      ok: true,
      data: {
        shops: [],
        scanned: 1,
        blockedShops: [{ gid: '910001', name: 'A号' }],
        blockedKeyCount: 1,
        scannedAt: Date.now(),
      },
    },
  })
  await store.scanYishuHuanfuFriendShops('acc-1', true)
  assert.equal(store.yishuHuanfuBlockedShops.length, 1)

  // 换号时先 clear：A 号被限的名单不能留在 B 号的界面上。
  store.clearYishuHuanfuFriendShops()
  assert.deepEqual(store.yishuHuanfuBlockedShops, [])
  assert.equal(store.yishuHuanfuFriendScanNote, '')
})

test('后端没下发 blockedShops 时按空数组处理，不报错', async () => {
  const store = freshStore()
  api.get = async () => ({
    data: { ok: true, data: { shops: [], scanned: 1, blockedKeyCount: 0, scannedAt: Date.now() } },
  })
  const ok = await store.scanYishuHuanfuFriendShops('acc-1', true)
  assert.equal(ok, true)
  assert.deepEqual(store.yishuHuanfuBlockedShops, [])
})
