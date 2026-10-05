import type { ViteDevServer } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBuildViteConfig } from '../build/vite-config.js'
import { getViteConfigWithPlugins } from '../vite/index.js'

vi.mock('../vite/index.js', () => ({ getViteConfigWithPlugins: vi.fn() }))

/** Retrieves Histoire's final static-bundle chunk classifier. */
async function createManualChunks() {
  const viteConfig = await createBuildViteConfig({
    config: { embed: { enabled: false }, outDir: '/tmp/histoire-static-build' },
  } as any, {
    config: { server: {} },
  } as ViteDevServer)
  const plugin = viteConfig.plugins.find(candidate => (candidate as any)?.name === 'histoire-build-config-override') as any
  const config = { build: { rollupOptions: {} }, define: {} }
  plugin.config(config)
  return config.build.rollupOptions.output.manualChunks as (id: string, graph: { getModuleInfo: (id: string) => { importedIds: string[] } | null }) => string | undefined
}

describe('static build Vite config', () => {
  beforeEach(() => {
    vi.mocked(getViteConfigWithPlugins).mockResolvedValue({ viteConfig: { plugins: [] } } as any)
  })

  it('classifies Rolldown modules without requiring whole-graph enumeration', async () => {
    const manualChunks = await createManualChunks()
    const imports = {
      '/node_modules/vue/index.js': [],
      '/node_modules/ui/index.js': ['/node_modules/vue/index.js', '/virtual/theme.js'],
      '/virtual/theme.js': ['/story.vue'],
      '/story.vue': [],
    }
    const graph = {
      getModuleInfo(id: string) {
        return { importedIds: imports[id as keyof typeof imports] ?? [] }
      },
    }

    expect(manualChunks('/node_modules/vue/index.js', graph)).toBe('vendor')
    expect(manualChunks('/node_modules/ui/index.js', graph)).toBeUndefined()
  })
})
