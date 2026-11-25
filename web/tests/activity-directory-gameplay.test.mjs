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

test('directory entries for 以薯换福 resolve to the yishuhuanfu gameplay, not stellar', () => {
  const { normalizeActivityDirectory } = loadStoreModule()
  const [entry] = normalizeActivityDirectory([
    {
      id: '2026111707',
      activityIds: ['2026111707', '2026111708', '2026111709'],
      name: '以薯换福',
      gameplayKey: 'yishuhuanfu',
      detailTarget: 'yishuhuanfu',
      gameplayTargets: ['yishuhuanfu'],
      startTime: 1764000000,
      endTime: 1765209600,
    },
  ])
  assert.equal(entry.gameplayKey, 'yishuhuanfu')
  assert.equal(entry.detailTarget, 'yishuhuanfu')
  assert.deepEqual(entry.gameplayTargets, ['yishuhuanfu'])
})

test('stellar sub-targets still resolve to the stellar gameplay', () => {
  const { normalizeActivityDirectory } = loadStoreModule()
  const entries = normalizeActivityDirectory([
    { id: '2026072700', name: '千星游记', detailTarget: 'travel' },
    { id: '2026072701', name: '千星游记', detailTarget: 'constellation' },
  ])
  assert.deepEqual(entries.map(entry => entry.gameplayKey), ['stellar', 'stellar'])
})

test('an unknown detail target no longer hijacks an entry into stellar', () => {
  const { normalizeActivityDirectory } = loadStoreModule()
  const [entry] = normalizeActivityDirectory([{ id: '9999999999', name: '未命名活动', detailTarget: 'brand-new-target' }])
  assert.equal(entry.detailTarget, null)
  assert.equal(entry.gameplayKey, null)
})
