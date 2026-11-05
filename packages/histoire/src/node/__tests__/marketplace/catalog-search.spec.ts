import type { Context } from '../../context.js'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { catalogFacets, filterCatalog } from '../../marketplace/catalog/facets.js'
import { officialPlugins } from '../../marketplace/catalog/official.js'
import { searchCatalog } from '../../marketplace/catalog/search.js'
import { compareVersions, satisfiesVersion } from '../../marketplace/catalog/version.js'
import { createVirtualFilesPlugin } from '../../virtual/vite-plugin.js'

describe('catalog search and static module', () => {
  it('preserves source offsets after Unicode case folding changes string length', () => {
    const entry = { ...officialPlugins[0], displayName: 'İVue', summary: 'Audits', id: 'audit' }
    expect(searchCatalog([entry], 'vue')[0]?.match).toEqual([{ field: 'displayName', ranges: [[1, 3]] }])
  })

  it.each([
    ['7.2.0', '^7.0.0', true],
    ['8.0.0', '^7.0.0', false],
    ['0.3.2', '^0.3.1', true],
    ['0.4.0', '^0.3.1', false],
    ['0.0.2', '^0.0.1', false],
    ['3.5.0', '>=3.2.0 <4.0.0', true],
    ['8.0.0', '^7.0.0 || ^8.0.0', true],
    ['1.0.0-beta.2', '^1.0.0-beta.1', true],
    ['1.1.0-beta.1', '^1.0.0-beta.1', false],
    ['7.0.0-beta.1', '^7.0.0', false],
    ['3.5.2', '~3.5.0', true],
    ['3.6.0', '~3.5.0', false],
    ['1.2.3', '1.0 - 2.0', true],
    ['2.0.9', '1.0 - 2.0', true],
    ['2.1.0', '1.0 - 2.0', false],
    ['7.2.9', '<=7.2', true],
    ['7.3.0', '<=7.2', false],
    ['7.3.0', '>7.2', true],
    ['7.2.9', '>7.2', false],
    ['7.0.0', '7.x', true],
    ['8.0.0', '7.x', false],
  ])('checks installed version %s against %s', (version, range, expected) => {
    expect(satisfiesVersion(version, range)).toBe(expected)
  })

  it('orders numeric prereleases by number and stable release after prereleases', () => {
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0-beta.10')).toBeGreaterThan(0)
  })

  it('counts each facet with its own selection excluded and highlights real text', () => {
    const entries = searchCatalog(officialPlugins, 'Vue')
    expect(entries.length).toBeGreaterThan(1)
    for (const entry of entries) {
      for (const match of entry.match!) {
        for (const [start, end] of match.ranges) expect(entry[match.field].slice(start, end + 1).toLowerCase()).toBe('vue')
      }
    }
    const filters = { category: 'testing' as const, officialOnly: true }
    const facets = catalogFacets(officialPlugins, filters)
    expect(facets.category.frameworks).toBe(officialPlugins.filter(entry => entry.category === 'frameworks').length)
    expect(facets.official).toBe(filterCatalog(officialPlugins, { category: 'testing' }).length)
    expect(filterCatalog(officialPlugins, filters).every(entry => entry.category === 'testing')).toBe(true)
  })

  // Defect: a detected framework no plugin names explicitly showed 0 although agnostic plugins match it.
  it('counts framework-agnostic plugins for detected frameworks', () => {
    const facets = catalogFacets(officialPlugins, {}, ['vue3'])
    expect(facets.frameworks.vue3).toBe(filterCatalog(officialPlugins, { frameworks: ['vue3'] }).length)
    expect(facets.frameworks.vue3).toBeGreaterThan(0)
  })

  it('resolves static catalog through real Vite plugin and imports rich named export', async () => {
    const plugin = createVirtualFilesPlugin({ mode: 'build' } as Context, false)
    const resolve = plugin.resolveId as (id: string) => Promise<string>
    const load = plugin.load as (id: string) => Promise<string>
    const id = await resolve('virtual:$histoire-marketplace-official')
    expect(typeof id).toBe('string')
    const source = await load(id)
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
    expect(module.officialPlugins).toHaveLength(officialPlugins.length)
    expect(module.officialPlugins[0].manifest.config.import).toBeTruthy()
    expect(module.officialPlugins.every(entry => entry.compatible.ok && !entry.installed)).toBe(true)
  })
})
