import type { ChangeRequest } from '@histoire/shared'
import type { Context } from '../../context.js'
import { readFile, writeFile } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { getPlanStore } from '../../marketplace/changes/handlers.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { deferred } from '../utils/mcp/deferred.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'
import { jobManifest } from './jobs-fixture.js'

const manifest = { ...jobManifest, migrations: [{ from: '<1', ops: [{ op: 'rename-option' as const, from: 'old', to: 'new' }] }] }
const request = { kind: 'update' as const, id: 'test-plugin', version: '1.2.3', migrate: true, prefs: { community: false, packageManager: 'pnpm' as const, afterInstall: 'restart' as const, skippedVersions: {} } }
afterEach(disposeConfigProjects)

/** Production handler's shared store is also the job runner's admission boundary. */
async function fixture(options = '{ old: \'secret\', keep: true }', resolvePlugin = async () => ({ manifest, version: '1.2.3' })) {
  const project = await inventoryProject(`import { TestPlugin } from 'test-plugin'\nexport default { plugins: [TestPlugin(${options})] }\n`, { 'test-plugin': '^0.3.0' })
  await inventoryPackage(project.root, 'test-plugin', '0.3.0')
  const store = getPlanStore({ root: project.root, configFile: project.file, mode: 'dev' } as Context, resolvePlugin)
  return { ...project, store }
}

it('binds migrated source to the displayed diff and revalidates installed version before admission', async () => {
  const { store, file, root } = await fixture()
  const before = await readFile(file, 'utf8')
  const plan = await store.plan(request)
  expect(plan.manual).toBeUndefined()
  const verified = await store.verifyPlan(plan.planId, plan.hash)
  expect(verified.request.migrate).toBe(true)
  expect(verified.configCode).toContain('new: \'secret\'')
  expect(verified.configCode).not.toContain('old:')
  const configDiff = plan.files.find(item => item.path === 'histoire.config.ts')!
  expect(configDiff.lines.filter(line => line.kind === 'add').map(line => line.text).join('\n')).toContain('new: \'secret\'')
  expect(await readFile(file, 'utf8')).toBe(before)
  const plain = await store.plan({ ...request, migrate: false })
  expect(plain.hash).not.toBe(plan.hash)
  expect((await store.verifyPlan(plain.planId, plain.hash)).configCode).toBe(before)
  await writeFile(`${root}/node_modules/test-plugin/package.json`, JSON.stringify({ name: 'test-plugin', version: '1.0.0' }))
  await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'stale' })
})

it('lists required manual migration operations for nonliteral arguments without an executable capability', async () => {
  const { store } = await fixture('getOptions()')
  const plan = await store.plan(request)
  expect(plan.manual?.reason).toBe('migration-manual')
  expect(plan.manual?.steps.map(step => step.title).join('\n')).toContain('Rename old to new')
  expect(plan.command).toBeUndefined()
  await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'unavailable' })
})

it('refuses automatic migrations when installed version cannot select a migration range', async () => {
  const { store, root } = await fixture()
  await writeFile(`${root}/node_modules/test-plugin/package.json`, JSON.stringify({ name: 'test-plugin', version: 'local' }))
  await expect(store.plan(request)).rejects.toMatchObject({ code: 'unavailable' })
})

it('captures caller intent before asynchronous metadata resolution', async () => {
  const entered = deferred()
  const released = deferred()
  const { store } = await fixture('{}', async () => {
    entered.resolve()
    await released.promise
    return { manifest, version: '1.2.3' }
  })
  const mutable: ChangeRequest = structuredClone(request)
  const planning = store.plan(mutable)
  await entered.promise
  mutable.version = '9.9.9'
  mutable.prefs.afterInstall = 'ask'
  released.resolve()
  const reviewed = await planning
  const baseline = await store.plan(request)
  expect(reviewed.hash).toBe(baseline.hash)
  expect((await store.verifyPlan(reviewed.planId, reviewed.hash)).request).toMatchObject({ version: '1.2.3', prefs: { afterInstall: 'restart' } })
})
