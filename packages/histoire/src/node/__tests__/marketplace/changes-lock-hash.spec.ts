import type { ChangeRequest } from '@histoire/shared'
import { rm, writeFile } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { marketplaceDefaults } from '../../../../../histoire-app/src/app/util/marketplace-preferences.js'
import { createPlanStore } from '../../marketplace/changes/plan-store.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { jobManifest, lockBytes } from './jobs-fixture.js'

/** Real planning intent; metadata comes from declarative fixture input. */
const request: ChangeRequest = { kind: 'install', id: 'test-plugin', prefs: { ...marketplaceDefaults(), packageManager: 'bun' as const, afterInstall: 'ask' as const } }
afterEach(disposeConfigProjects)

// Real plan admission must reject byte drift even when invalid UTF-8 bytes would
// decode to identical text. Missing and empty locks must also remain distinct.
it('binds reviewed plans to every binary lock byte and lockfile presence', async () => {
  const { root, file } = await configTestProject('export default { plugins: [] }\n')
  const store = createPlanStore({ root, configFile: file, resolvePlugin: async () => ({ manifest: jobManifest, version: '1.2.3' }) })
  const absent = await store.plan(request)
  await writeFile(`${root}/bun.lockb`, new Uint8Array())
  await expect(store.verifyPlan(absent.planId, absent.hash)).rejects.toMatchObject({ code: 'stale' })
  const empty = await store.plan(request)
  await writeFile(`${root}/bun.lockb`, lockBytes)
  await expect(store.verifyPlan(empty.planId, empty.hash)).rejects.toMatchObject({ code: 'stale' })
  const binary = await store.plan(request)
  await expect(store.verifyPlan(binary.planId, binary.hash)).resolves.toHaveProperty('request.id', 'test-plugin')
  await writeFile(`${root}/bun.lockb`, new Uint8Array([0, 254, 17, 10]))
  await expect(store.verifyPlan(binary.planId, binary.hash)).rejects.toMatchObject({ code: 'stale' })
  const changed = await store.plan(request)
  await rm(`${root}/bun.lockb`)
  await expect(store.verifyPlan(changed.planId, changed.hash)).rejects.toMatchObject({ code: 'stale' })
})
