import type { ChangeRequest, MarketplaceManifest } from '@histoire/shared'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { clearRegistryMemory, createRegistryCache } from '../../marketplace/catalog/cache.js'
import { packumentSchema } from '../../marketplace/catalog/registry-entry.js'
import { createPlanStore } from '../../marketplace/changes/plan-store.js'
import { projectPluginResolver } from '../../marketplace/changes/resolve-plugin.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'

const manifest: MarketplaceManifest = { displayName: 'Cached', summary: 'Cached metadata', category: 'testing', monogram: 'C', tint: 'blue', config: { import: 'CachedPlugin' } }
const prefs: ChangeRequest['prefs'] = { community: true, packageManager: 'npm', afterInstall: 'ask', skippedVersions: {} }
afterEach(disposeConfigProjects)

describe('read-only planning metadata', () => {
  it('uses catalog cache for exact target releases without refreshing or writing it', async () => {
    const { root, file } = await configTestProject('export default {}\n')
    const endpoint = 'https://registry.example/'
    const key = `${endpoint}community-plugin`
    const pkg = { 'name': 'community-plugin', 'dist-tags': { latest: '2.0.0' }, 'versions': {
      '1.0.0': { name: 'community-plugin', version: '1.0.0', histoire: { marketplace: { ...manifest, config: { import: 'OldPlugin' } } } },
      '2.0.0': { name: 'community-plugin', version: '2.0.0', histoire: { marketplace: manifest } },
    } }
    await createRegistryCache(root).get(key, value => packumentSchema.parse(value), async () => pkg)
    const cached = `${root}/node_modules/.cache/histoire/marketplace/registry/${createHash('sha256').update(key).digest('hex')}.json`
    const original = await readFile(cached, 'utf8')
    const store = createPlanStore({ root, configFile: file, resolvePlugin: projectPluginResolver(root, endpoint) })
    const plan = await store.plan({ kind: 'install', id: 'community-plugin', version: '1.0.0', prefs })
    expect(plan.manual).toBeUndefined()
    expect((await store.verifyPlan(plan.planId, plan.hash)).configCode).toContain('OldPlugin()')
    expect(await readFile(cached, 'utf8')).toBe(original)
    await expect(store.plan({ kind: 'install', id: 'missing-plugin', prefs })).rejects.toMatchObject({ code: 'unavailable' })
    await expect(store.plan({ kind: 'install', id: 'community-plugin', prefs: { ...prefs, community: false } })).rejects.toMatchObject({ code: 'unavailable' })
    pkg.versions['1.0.0'].histoire.marketplace.summary = 'Changed metadata'
    await writeFile(cached, JSON.stringify({ at: Date.now(), value: pkg }))
    // A fresh generation revalidates disk metadata instead of its prior memory snapshot.
    clearRegistryMemory(root)
    await expect(store.verifyPlan(plan.planId, plan.hash)).rejects.toMatchObject({ code: 'stale' })
  })

  it('reads installed community options with registry disabled without importing its executable', async () => {
    const code = 'import { CachedPlugin } from \'community-plugin\'\nexport default { plugins: [CachedPlugin()] }\n'
    const { root, file } = await configTestProject(code)
    await mkdir(`${root}/node_modules/community-plugin`, { recursive: true })
    await writeFile(`${root}/node_modules/community-plugin/package.json`, JSON.stringify({ name: 'community-plugin', version: '1.0.0', main: 'index.js', histoire: { marketplace: manifest } }))
    await writeFile(`${root}/node_modules/community-plugin/index.js`, 'throw new Error("Package code must not execute")')
    const store = createPlanStore({ root, configFile: file, resolvePlugin: projectPluginResolver(root) })
    const plan = await store.plan({ kind: 'remove', id: 'community-plugin', prefs: { ...prefs, community: false } })
    expect(plan.manual).toBeUndefined()
    expect((await store.verifyPlan(plan.planId, plan.hash)).configCode).not.toContain('CachedPlugin')
    expect(await readFile(file, 'utf8')).toBe(code)
  })
})
