import type { ChangeRequest, MarketplaceManifest } from '@histoire/shared'
import type { Context } from '../../context.js'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import a11y from '../../../../../histoire-plugin-a11y/package.json' with { type: 'json' }
import { analyzePluginSource } from '../../config/plugin-toggle-source.js'
import { registerPlanHandlers } from '../../marketplace/changes/handlers.js'
import { createPlanStore } from '../../marketplace/changes/plan-store.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { deferred } from '../utils/mcp/deferred.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { inventoryPackage } from './inventory-fixture.js'
import { jobManifest } from './jobs-fixture.js'

const manifest: MarketplaceManifest = { ...jobManifest, config: { ...jobManifest.config, options: [{ key: 'test', label: 'Tests', type: 'boolean', default: false }] } }
const prefs: ChangeRequest['prefs'] = { ...marketplaceDefaults(), packageManager: 'pnpm' as const }
const request: ChangeRequest = { kind: 'install', id: 'test-plugin', version: '1.2.3', prefs, options: { test: true } }
afterEach(disposeConfigProjects)

// Boundary: real planner/store reads temporary files; declarative manifest is
// algorithm input. No package manager, project code or implementation is mocked.
describe('marketplace reviewed plans', () => {
  it.each(['1.0.0', '2.0.0', '3.0.0'])('warns only when pinning below installed version: %s', async (version) => {
    const { root, file } = await configTestProject('import { TestPlugin } from "test-plugin"; export default { plugins: [TestPlugin()] }')
    await writeFile(`${root}/package.json`, '{"devDependencies":{"test-plugin":"^0.1.0"}}')
    await inventoryPackage(root, 'test-plugin', '2.0.0')
    const store = createPlanStore({ root, configFile: file, resolvePlugin: async () => ({ manifest, version }) })
    const plan = await store.plan({ ...request, kind: 'pin', version })
    expect(plan.manual).toBeUndefined()
    expect(plan.warnings.filter(warning => warning.includes('downgrade'))).toEqual(version === '1.0.0'
      ? ['Pinning test-plugin downgrades from 2.0.0 to 1.0.0. Config migrations are not applied.']
      : [])
    if (version === '1.0.0') {
      await inventoryPackage(root, 'test-plugin', '0.5.0')
      await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'stale' })
    }
  })

  it('plans all operations without writes and retains exact job inputs privately', async () => {
    const code = 'import { TestPlugin } from \'test-plugin\'\nexport default { plugins: [TestPlugin({ test: false })] }\n'
    const { root, file } = await configTestProject(code)
    const packageCode = '{\n  "name": "fixture",\n  "devDependencies": { "zzz": "1", "test-plugin": "^1.0.0" }\n}\n'
    await writeFile(`${root}/package.json`, packageCode)
    const store = createPlanStore({ root, configFile: file, resolvePlugin: async () => ({ manifest, version: '1.2.3' }) })
    for (const kind of ['install', 'remove', 'update', 'pin', 'options'] as const) {
      const plan = await store.plan({ ...request, kind })
      expect(plan.manual).toBeUndefined()
      const verified = await store.verifyPlan(plan.planId, plan.hash)
      expect(verified.request.kind).toBe(kind)
      expect(verified.configHash).toHaveLength(64)
      expect(analyzePluginSource(verified.configCode!).map(entry => entry.expression)).toEqual(kind === 'remove' ? [] : ['TestPlugin({ test: true })'])
      if (kind === 'options') {
        expect(plan.command).toBeUndefined()
      }
      else {
        expect(plan.files.map(item => item.path)).toContain('package.json')
        const next = JSON.parse(verified.packageCode)
        expect(next.devDependencies['test-plugin']).toBe(kind === 'remove' ? undefined : kind === 'pin' ? '1.2.3' : '^1.2.3')
        expect(next.devDependencies.zzz).toBe('1')
      }
    }
    expect(await readFile(file, 'utf8')).toBe(code)
    expect(await readFile(`${root}/package.json`, 'utf8')).toBe(packageCode)
    expect((await readdir(root)).sort()).toEqual(['histoire.config.ts', 'package.json'])
  })

  it('rejects wrong hashes, changed config, package bytes and expired or cleared plans', async () => {
    const { root, file } = await configTestProject('export default {}\n')
    await writeFile(`${root}/package.json`, '{}\n')
    let now = 10
    const store = createPlanStore({ root, configFile: file, resolvePlugin: async () => ({ manifest, version: '1.2.3' }), now: () => now })
    const initial = await store.plan(request)
    await expect(store.verifyPlan(initial.planId, 'wrong')).rejects.toMatchObject({ code: 'stale' })
    await writeFile(file, 'export default { theme: {} }\n')
    await expect(store.verifyPlan(initial.planId, initial.hash)).rejects.toMatchObject({ code: 'stale' })
    const current = await store.plan(request)
    await writeFile(`${root}/package.json`, '{"name":"changed"}\n')
    await expect(store.verifyPlan(current.planId, current.hash)).rejects.toMatchObject({ code: 'stale' })
    const expiring = await store.plan(request)
    now += 15 * 60 * 1000 - 1
    await expect(store.verifyPlan(expiring.planId, expiring.hash)).resolves.toHaveProperty('configCode')
    now += 1
    await expect(store.verifyPlan(expiring.planId, expiring.hash)).rejects.toMatchObject({ code: 'stale' })
    const clearable = await store.plan(request)
    store.clear()
    await expect(store.verifyPlan(clearable.planId, clearable.hash)).rejects.toMatchObject({ code: 'stale' })
  })

  it('rejects lockfile drift and caller mutation, and cannot admit work after retirement', async () => {
    const { root, file } = await configTestProject('export default {}\n')
    await writeFile(`${root}/package.json`, '{}\n')
    await writeFile(`${root}/pnpm-lock.yaml`, 'original')
    const store = createPlanStore({ root, configFile: file, resolvePlugin: async () => ({ manifest, version: '1.2.3' }) })
    const input = structuredClone(request)
    const reviewed = await store.plan(input)
    input.options!.test = false
    expect((await store.verifyPlan(reviewed.planId, reviewed.hash)).request.options).toEqual({ test: true })
    await writeFile(`${root}/pnpm-lock.yaml`, 'changed')
    await expect(store.verifyPlan(reviewed.planId, reviewed.hash)).rejects.toMatchObject({ code: 'stale' })
    store.clear()
    await expect(store.plan(request)).rejects.toMatchObject({ code: 'stale' })
  })

  it('rejects verification that crosses expiry and plans resolving after generation cleanup', async () => {
    const { root, file } = await configTestProject('export default {}\n')
    let now = 0
    let hold = false
    let released = deferred()
    let entered = deferred()
    const store = createPlanStore({ root, configFile: file, now: () => now, resolvePlugin: async () => {
      if (hold) {
        entered.resolve()
        await released.promise
      }
      return { manifest, version: '1.2.3' }
    } })
    const reviewed = await store.plan(request)
    hold = true
    const verifying = store.verifyPlan(reviewed.planId, reviewed.hash)
    const assertion = expect(verifying).rejects.toMatchObject({ code: 'stale' })
    await entered.promise
    now = 15 * 60 * 1000
    released.resolve()
    await assertion
    released = deferred()
    entered = deferred()
    const planning = store.plan(request)
    const retired = expect(planning).rejects.toMatchObject({ code: 'stale' })
    await entered.promise
    store.clear()
    released.resolve()
    await retired
  })

  it.each([
    ['config-not-literal', 'export default { plugins: external }', 'pnpm', false],
    ['config-not-literal', undefined, 'pnpm', false],
    ['no-package-manager', 'export default {}', 'auto', false],
    ['migration-manual', 'export default {}', 'pnpm', true],
    ['static', 'export default {}', 'pnpm', false],
    ['workspace-unsupported', 'export default {}', 'pnpm', false],
  ] as const)('returns useful %s manual instructions with no executable command', async (reason, code, manager, migrate) => {
    const { root, file } = await configTestProject(code)
    if (reason === 'workspace-unsupported') await writeFile(`${root}/package.json`, JSON.stringify({ devDependencies: { 'test-plugin': 'workspace:*' } }))
    const store = createPlanStore({ root, configFile: code === undefined ? undefined : file, static: reason === 'static', resolvePlugin: async () => ({ manifest, version: '1.2.3' }) })
    const plan = await store.plan({ ...request, migrate, prefs: { ...prefs, packageManager: manager } })
    expect(plan.manual?.reason).toBe(reason)
    expect(plan.command).toBeUndefined()
    expect(plan.files).toEqual([])
    const instructions = plan.manual!.steps.map(step => step.code).join('\n')
    for (const tool of ['pnpm', 'npm', 'yarn', 'bun']) expect(instructions).toContain(tool)
    expect(instructions).toContain('TestPlugin({ test: true })')
    await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('validates channel requests, replies privately and expires generation storage', async () => {
    const { root, file } = await configTestProject('export default {}\n')
    await writeFile(`${root}/package.json`, '{}\n')
    const fixture = uiChannelFixture()
    onTestFinished(() => fixture.channel.close())
    registerPlanHandlers({ root, configFile: file, mode: 'dev' } as Context, fixture.channel, () => true)
    await fixture.request('histoire:ui:marketplace-plan', { requestId: 'invalid', request: { ...request, id: '--package' } })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-plan-result', { requestId: 'invalid', error: expect.objectContaining({ code: 'invalid' }) })
    await fixture.request('histoire:ui:marketplace-plan', { requestId: 'valid', request: { kind: 'install', id: '@histoire/plugin-a11y', prefs } })
    expect(fixture.client.send).toHaveBeenLastCalledWith('histoire:ui:marketplace-plan-result', { requestId: 'valid', plan: expect.objectContaining({ command: expect.objectContaining({ argv: expect.arrayContaining([`@histoire/plugin-a11y@${a11y.version}`]) }) }) })
    expect(fixture.ws.send).not.toHaveBeenCalled()
  })
})
