import { describe, expect, it } from 'vitest'
import { HstVue } from '../../../../histoire-plugin-vue/src/index.node.ts'

describe('hstVue collect transform', () => {
  it('stubs unknown components and preserves bare vitest imports', () => {
    const plugin = HstVue().config().vite.plugins[0]
    const source = `
import { describe, it } from 'vitest'
import { _resolveComponent } from "vue"

_resolveComponent("HstButton")
`

    const transformed = plugin.transform.call({
      meta: {
        histoire: {
          isCollecting: true,
        },
      },
    }, source, '/virtual/Example.story.vue')

    expect(typeof transformed).toBe('string')
    expect(transformed).toContain('const _stubComponent =')
    expect(transformed).toContain(`from 'vitest'`)
    expect(transformed).not.toContain('vitest-collect')
    expect(transformed).toContain('_stubComponent("HstButton")')
  })
})
