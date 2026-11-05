import type { Context } from '../../context.js'
import { writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../../config/load.js'
import { resolvePluginMetadata } from '../../config/plugin-metadata.js'
import { createPluginInventory } from '../../config/plugin-toggle-inventory.js'
import { analyzePluginSource, disablePluginEntry } from '../../config/plugin-toggle-source.js'
import { getInstalledIndex } from '../../marketplace/inventory/index.js'
import { resolvePluginPackage } from '../../marketplace/inventory/package-resolve.js'
import { resolvedConfig } from '../../virtual/resolved-config.js'
import { disposeConfigProjects } from '../utils/config-codemod.js'
import { inventoryPackage, inventoryProject } from './inventory-fixture.js'

afterEach(disposeConfigProjects)

// Boundary: actual package bytes, config parser and inventory. Factories are never imported.
// Wrong range/name joins, local updates and spoofed official labels must differ from these rows.
describe('marketplace installed package resolution', () => {
  it('uses installed bytes rather than dependency ranges and never imports package code', async () => {
    const { root } = await inventoryProject(undefined, { '@histoire/plugin-a11y': '^1.0.0' })
    await inventoryPackage(root, '@histoire/plugin-a11y', '1.2.3')
    expect(await resolvePluginMetadata(root, [{ name: '@histoire/plugin-a11y' }])).toMatchObject([{ packageName: '@histoire/plugin-a11y', version: '1.2.3' }])
    expect(await resolvePluginPackage(root, '@histoire/plugin-a11y')).toMatchObject({ packageName: '@histoire/plugin-a11y', version: '1.2.3', local: false, official: true, pinned: false })
    await inventoryPackage(root, '@histoire/spoof', '2.0.0', { official: true })
    expect(await resolvePluginPackage(root, '@histoire/spoof')).toMatchObject({ official: false })
  })

  it.each(['workspace:*', 'file:../plugin', 'link:../plugin'])('labels %s dependencies local', async (range) => {
    const { root } = await inventoryProject(undefined, { plugin: range })
    await inventoryPackage(root, 'plugin', '9.0.0')
    expect(await resolvePluginPackage(root, 'plugin')).toMatchObject({ packageName: 'plugin', version: 'local', local: true })
  })

  it('maps imported aliases and disabled factories, preserves toggle IDs, and emits both modes', async () => {
    const source = `import { first as make } from 'plugin/subpath'; import { second } from './local.cjs'; export default { plugins: [make(), second()] }`
    const { root, file } = await inventoryProject(source, { plugin: '1.2.3' })
    await inventoryPackage(root, 'plugin', '1.2.3', { description: 'Installed description' })
    // Config loading must run factories; package resolution must only read JSON afterward.
    await writeFile(join(root, 'node_modules/plugin/subpath.js'), 'exports.first = () => ({ name: "custom-name" })')
    await writeFile(join(root, 'local.cjs'), 'exports.second = () => ({ name: "relative-plugin" })')
    await inventoryPackage(root, 'relative-plugin', '9.0.0')
    const activeConfig = await resolveConfig(root, 'dev')
    const active = await createPluginInventory({ root, config: activeConfig, mode: 'dev' } as Context)
    expect(active.rows.find(row => row.name === 'custom-name')).toMatchObject({ packageName: 'plugin', version: '1.2.3', enabled: true, local: false })
    expect(active.rows.find(row => row.name === 'relative-plugin')?.packageName).toBeUndefined()
    const entry = analyzePluginSource(source)[0]
    await writeFile(file, disablePluginEntry(source, entry, { name: 'custom-name', client: false, frame: false }))
    for (const mode of ['dev', 'build'] as const) {
      const config = await resolveConfig(root, mode)
      const ctx = { root, config, mode, pluginMetadata: await resolvePluginMetadata(root, config.plugins) } as Context
      const inventory = await createPluginInventory(ctx)
      ctx.pluginInventory = inventory.rows
      const disabled = inventory.rows.find(row => row.name === 'custom-name')!
      expect(disabled).toMatchObject({ packageName: 'plugin', version: '1.2.3', enabled: false, local: false, required: false, official: false, description: 'Installed description' })
      expect(inventory.rows.find(row => row.name === 'relative-plugin')).toMatchObject({ version: 'local', local: true })
      expect(inventory.rows.find(row => row.name === 'relative-plugin')?.packageName).toBeUndefined()
      expect(Boolean(disabled.toggleId)).toBe(mode === 'dev')
      expect(inventory.toggle?.targets.get(disabled.toggleId!)?.row).toBe(mode === 'dev' ? disabled : undefined)
      const index = getInstalledIndex(ctx)
      expect(index.get('plugin')).toEqual({ version: '1.2.3', enabled: false, required: false })
      expect(getInstalledIndex(ctx)).toBe(index)
      const module = await import(`data:text/javascript,${encodeURIComponent(resolvedConfig(ctx))}`)
      expect(module.installedPlugins.find((row: { name: string }) => row.name === 'custom-name')).toMatchObject({ packageName: 'plugin', version: '1.2.3', local: false, required: false, official: false })
    }
  })

  it('requires builtins and matching framework manifests without trusting package claims', async () => {
    const { root } = await inventoryProject(undefined, { vue: '^3.0.0' })
    const manifest = { displayName: 'Support', summary: 'Support', category: 'frameworks', frameworks: ['vue'], monogram: 'S', tint: 'slate', config: { import: 'Support' } }
    await inventoryPackage(root, 'support', '1.0.0', { histoire: { marketplace: manifest } })
    await inventoryPackage(root, 'other-support', '1.0.0', { histoire: { marketplace: { ...manifest, frameworks: ['svelte'] } } })
    const plugins = [{ name: 'builtin:vanilla-support' }, { name: 'support' }, { name: 'other-support' }]
    const ctx = { root, mode: 'dev', config: { plugins }, pluginMetadata: await resolvePluginMetadata(root, plugins) } as Context
    const { rows } = await createPluginInventory(ctx)
    expect(rows.map(row => [row.name, row.required])).toEqual([['builtin:vanilla-support', true], ['support', true], ['other-support', false]])
  })
})
