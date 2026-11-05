import type { Context } from '../../context.js'
import { readFile, writeFile } from 'node:fs/promises'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { closeContext, createContext } from '../../context.js'
import { getPlanStore } from '../../marketplace/changes/handlers.js'
import { createJobRunner } from '../../marketplace/jobs/runner.js'
import { registerMigrationHandlers } from '../../marketplace/migrations/handlers.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { registryServer } from '../utils/marketplace/registry-server.js'
import { uiChannelFixture } from '../utils/ui-channel.js'
import { inventoryPackage } from './inventory-fixture.js'
import { jobManifest, jobProject } from './jobs-fixture.js'

const prefs = { ...marketplaceDefaults(), community: true, packageManager: 'pnpm' as const }
afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

it('reviews every intervening release and writes exactly the shown migration through real update runner', async () => {
  const releases = {
    '2.0.0': { ...jobManifest, releaseNotes: [{ kind: 'fix', text: 'Future excluded' }] },
    '1.2.3': { ...jobManifest, releaseNotes: [{ kind: 'breaking', text: 'Final name' }], migrations: [{ from: '<1', ops: [{ op: 'rename-option', from: 'middle', to: 'new' }] }] },
    '0.3.0': { ...jobManifest, releaseNotes: [{ kind: 'fix', text: 'Installed excluded' }] },
    '0.4.0': { ...jobManifest, releaseNotes: [{ kind: 'feature', text: 'Middle name' }], migrations: [{ from: '<0.4', ops: [{ op: 'rename-option', from: 'old', to: 'middle' }] }] },
  }
  const registry = await registryServer({ packages: { 'test-plugin': {
    'name': 'test-plugin',
    'dist-tags': { latest: '2.0.0' },
    'versions': Object.fromEntries(Object.entries(releases).map(([version, manifest]) => [version, { name: 'test-plugin', version, histoire: { marketplace: manifest }, ...(version === '2.0.0' ? { deprecated: 'Unavailable' } : {}) }])),
  } } })
  onTestFinished(registry.close)
  vi.stubEnv('npm_config_registry', registry.url)
  const fixture = await jobProject()
  const original = 'import { TestPlugin } from \'test-plugin\'\nexport default { plugins: [TestPlugin({ old: \'secret\', keep: true })] }\n'
  await writeFile(fixture.file, original)
  await inventoryPackage(fixture.root, 'test-plugin', '0.3.0')
  const ctx = { root: fixture.root, configFile: fixture.file, mode: 'dev' } as Context
  const channel = uiChannelFixture()
  onTestFinished(() => channel.channel.close())
  registerMigrationHandlers(ctx, channel.channel, () => true)
  await channel.request('histoire:ui:marketplace-update-detail', { requestId: 'detail', id: 'test-plugin', prefs })
  const response = channel.client.send.mock.calls.at(-1)![1] as any
  expect(response.error).toBeUndefined()
  expect(response.detail.latest).toBe('1.2.3')
  expect(response.detail.releaseNotes).toEqual([{ kind: 'breaking', text: 'Final name' }, { kind: 'feature', text: 'Middle name' }])
  expect(response.detail.manifest.migrations[0].ops).toEqual([{ op: 'rename-option', from: 'old', to: 'middle' }, { op: 'rename-option', from: 'middle', to: 'new' }])
  expect(registry.requests).toHaveLength(1)
  const plans = getPlanStore(ctx)
  const plan = await plans.plan({ kind: 'update', id: 'test-plugin', version: '1.2.3', migrate: true, prefs })
  expect(plan.manual).toBeUndefined()
  const config = plan.files.find(file => file.path === 'histoire.config.ts')!
  // This fixture fits one complete hunk; reconstruct exactly what user reviewed.
  const shown = `${config.lines.filter(line => line.kind !== 'del').map(line => line.text).join('\n')}\n`
  expect(shown).toContain('new: \'secret\'')
  expect(shown).not.toMatch(/old:|middle:/)
  expect(shown).toContain('keep: true')
  expect(await readFile(fixture.file, 'utf8')).toBe(original)
  const runner = createJobRunner({ root: fixture.root, configFile: fixture.file, plans, env: fixture.env })
  await runner.start(plan.planId, plan.hash)
  await runner.wait()
  expect(await readFile(fixture.file, 'utf8')).toBe(shown)
  expect((await runner.current())?.steps.find(step => step.id === 'config')?.state).toBe('done')
  const successor = await createContext({ root: fixture.root, mode: 'dev' })
  try {
    const next = createJobRunner({ root: fixture.root, configFile: fixture.file, plans, context: successor })
    expect(await next.current()).toMatchObject({ kind: 'update', version: '1.2.3', status: 'succeeded' })
  }
  finally { await closeContext(successor) }
  expect(registry.requests).toHaveLength(1) // Planning and admission read cache only.
})
