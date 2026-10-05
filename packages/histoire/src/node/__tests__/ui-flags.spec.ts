import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { createFlagsPlugin } from '../vite/extra-plugins.js'

describe('workbench development flags', () => {
  it.each(['workbench.ts', 'mount.ts?v=1', 'Inspector.vue', 'bundle.mjs'])('replaces source and bundle flags in %s', (id) => {
    const plugin = createFlagsPlugin({ mode: 'dev' } as Context)
    const transform = plugin.transform as (code: string, id: string) => string | undefined
    expect(transform('const dev = __HISTOIRE_DEV__', id)).toBe('const dev = true')
  })

  it('removes dev branches in static source helpers and Vue templates', () => {
    const plugin = createFlagsPlugin({ mode: 'build' } as Context)
    const transform = plugin.transform as (code: string, id: string) => string | undefined
    expect(transform('if (__HISTOIRE_DEV__) loadAgents()', 'workbench.ts')).toBe('if (false) loadAgents()')
    expect(transform('_ctx.__HISTOIRE_DEV__ ? tests : null', 'Inspector.vue')).toBe('false ? tests : null')
  })
})
