import { describe, expect, it } from 'vitest'
import { isLazyBrowserDependency } from '../../build/lazy-dependencies.js'

describe('optional browser dependency chunk ownership', () => {
  it('keeps sanitizer, source highlighter and mock bootstrap out of shared Vue vendor chunk', () => {
    for (const module of ['dompurify/dist/purify.es.mjs', 'shiki/dist/index.mjs', '@shikijs/langs/dist/vue.mjs', '@shikijs/engine-oniguruma/dist/wasm-inlined.mjs', 'msw/lib/browser/index.mjs', '@mswjs/interceptors/lib/browser.mjs']) {
      expect(isLazyBrowserDependency(`/project/node_modules/${module}`), module).toBe(true)
      expect(isLazyBrowserDependency(`/project/node_modules/.pnpm/dependency/node_modules/${module}?import`), module).toBe(true)
    }
    expect(isLazyBrowserDependency('C:\\project\\node_modules\\dompurify\\dist\\purify.js')).toBe(true)
  })

  it('preserves normal vendor ownership and rejects package/file lookalikes', () => {
    for (const module of ['/project/src/shiki.ts', '/project/node_modules/shikijs/index.js', '/project/node_modules/dompurify-extra/index.js', '/project/node_modules/@shikijs-extra/core/index.js', '/project/node_modules/vue/index.js', '/project/node_modules/@histoire/protocol/index.js']) expect(isLazyBrowserDependency(module), module).toBe(false)
  })
})
