import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { createBuildChunkOutput } from '../build/chunks.js'

describe('static build Vite config', () => {
  it('classifies Rolldown modules without requiring whole-graph enumeration', () => {
    const output = createBuildChunkOutput({ config: { embed: { enabled: false } } } as Context)
    const classify = output.codeSplitting?.groups[0].name ?? output.manualChunks!
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

    expect(classify('/node_modules/vue/index.js', graph)).toBe('vendor')
    expect(classify('/node_modules/ui/index.js', graph)).toBeFalsy()
  })
})
