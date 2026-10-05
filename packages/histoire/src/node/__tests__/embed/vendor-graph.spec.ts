import { describe, expect, it } from 'vitest'
import { createVendorModuleSet } from '../../build/vendor-graph.js'

describe('vendor graph ownership', () => {
  it('keeps project-dependent modules out of vendor without removing neutral dependencies', () => {
    const graph = {
      '/node_modules/vue.js': [],
      '/node_modules/ui.js': ['/node_modules/vue.js', '/virtual/theme.js'],
      '/node_modules/nuxt.js': ['/node_modules/ui.js'],
      '/virtual/theme.js': ['/story.vue'],
      '/story.vue': ['/node_modules/vue.js'],
    }
    const vendor = createVendorModuleSet(Object.keys(graph), id => ({ importedIds: graph[id as keyof typeof graph] }), id => id.includes('/node_modules/'))
    expect([...vendor]).toEqual(['/node_modules/vue.js'])
  })

  it('handles cycles and retains dynamic-only consumers of optional engines', () => {
    const graph = {
      '/node_modules/first.js': ['/node_modules/second.js'],
      '/node_modules/second.js': ['/node_modules/first.js', '/excluded.js'],
      '/excluded.js': [],
      '/node_modules/lazy-host.js': [],
    }
    // Rollup importedIds contains static edges; dynamically imported optional
    // engines never force their host out of its otherwise independent chunk.
    const vendor = createVendorModuleSet(Object.keys(graph), id => ({ importedIds: graph[id as keyof typeof graph], dynamicallyImportedIds: ['/excluded.js'] }), id => id.includes('/node_modules/'))
    expect([...vendor]).toEqual(['/node_modules/lazy-host.js'])
  })

  it('preserves portable SDK boundary when packages use installed node_modules paths', () => {
    const graph = {
      '/node_modules/@histoire/protocol/index.js': [],
      '/node_modules/@histoire/sdk/index.js': ['/node_modules/@histoire/protocol/index.js'],
      '/node_modules/vue/index.js': [],
    }
    const vendor = createVendorModuleSet(Object.keys(graph), id => ({ importedIds: graph[id as keyof typeof graph] }), id => !id.includes('@histoire/protocol'))
    expect([...vendor]).toEqual(['/node_modules/vue/index.js'])
  })
})
