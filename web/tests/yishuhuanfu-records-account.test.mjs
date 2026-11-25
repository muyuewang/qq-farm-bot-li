import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// This repository runs its tests with Node's built-in runner.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')

// 收购记录（cmd 95）是按账号取的：切号后必须重新请求并替换列表。
// 之前的实现把列表放在全局 ref 里，页面又用「列表非空就跳过」当守卫，
// 结果切号后一直显示上一个账号的记录，只有手动点刷新（force）才会变。
// 这里加载真实的 activity-center store，只替换 HTTP 层。
const api = {
  get: async () => ({ data: { ok: true, data: { records: [], message: '' } } }),
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

function recordFor(gid) {
  return {
    timestamp: '1795500000',
    gid,
    count: '30',
    total: '4320',
    name: `name-${gid}`,
    avatar: '',
    level: '143',
    commission: '86',
  }
}

function bodyFor(gid) {
  return { data: { ok: true, data: { records: [recordFor(gid)], message: `${gid} 的收购记录` } } }
}

test('records follow the current account instead of the previously loaded one', async () => {
  const calls = []
  api.get = async (_url, config) => {
    const gid = config.headers['x-account-id']
    calls.push(gid)
    return bodyFor(gid)
  }
  const store = freshStore()

  // 两个账号都不传 force：切号必须让「已加载」守卫失效，自己重新请求。
  assert.equal(await store.loadYishuHuanfuRecords('1000232619'), true)
  assert.deepEqual(store.yishuHuanfuRecords.map(entry => entry.gid), ['1000232619'])

  // 切到另一个账号：必须真的发一次请求，并把列表换成新账号的。
  assert.equal(await store.loadYishuHuanfuRecords('1006086548'), true)
  assert.deepEqual(store.yishuHuanfuRecords.map(entry => entry.gid), ['1006086548'])
  assert.deepEqual(calls, ['1000232619', '1006086548'])
})

test('records are not refetched for the same account without force', async () => {
  const calls = []
  api.get = async (_url, config) => {
    calls.push(config.headers['x-account-id'])
    return bodyFor(config.headers['x-account-id'])
  }
  const store = freshStore()

  await store.loadYishuHuanfuRecords('1000232619', true)
  // 同一账号的常规调用靠「已加载」守卫跳过，不重复打网关。
  assert.equal(await store.loadYishuHuanfuRecords('1000232619'), true)
  assert.deepEqual(calls, ['1000232619'])
})

test('switching accounts clears the list at once and drops the late reply', async () => {
  let resolveFirst
  const store = freshStore()
  api.get = async (_url, config) => {
    if (config.headers['x-account-id'] === 'A') {
      // 第一个账号的请求挂起，模拟「切号时旧请求还没回来」。
      return new Promise((resolve) => {
        resolveFirst = () => resolve(bodyFor('A'))
      })
    }
    return bodyFor('B')
  }

  const pending = store.loadYishuHuanfuRecords('A', true)
  assert.equal(await store.loadYishuHuanfuRecords('B', true), true)
  assert.deepEqual(store.yishuHuanfuRecords.map(entry => entry.gid), ['B'])

  // 旧账号的回包晚到：不能覆盖当前账号的列表。
  resolveFirst()
  await pending
  assert.deepEqual(store.yishuHuanfuRecords.map(entry => entry.gid), ['B'])
})

test('switching accounts clears the friend shop ranking too', async () => {
  const shop = { gid: '900001', name: '阿甲', price: '99', bonus: '66', quota: '8000', canSell: true }
  api.get = async (_url, config) => ({
    data: {
      ok: true,
      data: {
        shops: config.headers['x-account-id'] === 'A' ? [shop] : [{ ...shop, gid: '900002', name: '阿乙' }],
        scanned: 1,
        failed: 0,
      },
    },
  })
  const store = freshStore()

  await store.scanYishuHuanfuFriendShops('A', true)
  assert.deepEqual(store.yishuHuanfuFriendShops.map(entry => entry.gid), ['900001'])

  await store.scanYishuHuanfuFriendShops('B', true)
  assert.deepEqual(store.yishuHuanfuFriendShops.map(entry => entry.gid), ['900002'])
})
