import type { Plugin } from 'vite'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { createCollectionOptimizerPolicy } from '../vite/collection-optimizer.js'

describe('node collection optimizer ownership', () => {
  it('disables optimization after framework config injects client dependencies', async () => {
    const config = await resolveConfig({
      configFile: false,
      plugins: [
        { name: 'framework', enforce: 'post', config: () => ({ optimizeDeps: { include: ['svelte'], noDiscovery: false }, environments: { client: { optimizeDeps: { include: ['svelte/internal/client'], noDiscovery: false } } } }) },
        createCollectionOptimizerPolicy(true),
      ],
    }, 'serve')
    expect(config.optimizeDeps).toMatchObject({ include: [], noDiscovery: true })
    expect(config.environments.client.optimizeDeps).toMatchObject({ include: [], noDiscovery: true })
  })

  it('normalizes both resolved copies after a framework configResolved hook', async () => {
    const framework: Plugin = {
      name: 'framework-resolved',
      enforce: 'post',
      configResolved(config) {
        config.optimizeDeps.include = ['svelte']
        config.optimizeDeps.noDiscovery = false
        config.environments.client.optimizeDeps.include = ['svelte/internal/client']
        config.environments.client.optimizeDeps.noDiscovery = false
      },
    }
    const config = await resolveConfig({ configFile: false, plugins: [framework, createCollectionOptimizerPolicy(true)] }, 'serve')
    expect(config.optimizeDeps).toMatchObject({ include: [], noDiscovery: true })
    expect(config.environments.client.optimizeDeps).toMatchObject({ include: [], noDiscovery: true })
  })

  it.each([true, false])('preserves client discovery=%s and explicit dependencies', async (noDiscovery) => {
    const config = await resolveConfig({ configFile: false, optimizeDeps: { include: ['vue'], noDiscovery }, plugins: [createCollectionOptimizerPolicy(false)] }, 'serve')
    expect(config.optimizeDeps).toMatchObject({ include: ['vue'], noDiscovery })
    expect(config.environments.client.optimizeDeps).toMatchObject({ include: ['vue'], noDiscovery })
  })
})
