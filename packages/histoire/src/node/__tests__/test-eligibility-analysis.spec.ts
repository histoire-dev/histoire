import { describe, expect, it } from 'vitest'
import { analyzeCollectionModule } from '../test/eligibility/analysis.js'

describe('collection registration reachability', () => {
  it('follows static imports, re-exports and literal dynamic imports', () => {
    expect(analyzeCollectionModule(`import Button from './Button.vue'; export * from './helpers'; import('./late.js')`)).toEqual({ imports: ['./Button.vue', './helpers', './late.js'], safe: true })
  })

  it.each([
    `import { onTest as register } from 'histoire/client'; register(() => {})`,
    `export { onTest } from 'histoire/client'`,
    `globalThis['__HST_TEST_REGISTRY__'].push(callback)`,
    `globalThis.__HST_TEST_REGISTRY__.push(callback)`,
    `import(moduleName)`,
    `eval(source)`,
    `new Function(source)()`,
    `require(moduleName)`,
    `const root = globalThis; root[key].push(callback)`,
    `Reflect.get(globalThis, key)`,
    `window['eval'](source)`,
    `(() => {}).constructor(source)()`,
    `document.createElement('script')`,
    `const root=globalThis;const alias=root;alias[key].push(callback)`,
    `document.defaultView[key].push(callback)`,
    `const read=()=>root[key];const root=globalThis;read().push(callback)`,
    `setTimeout(source, 0)`,
    `document.createElement(tag)`,
  ])('keeps opaque or registration-bearing code on mounted path: %s', (code) => {
    expect(analyzeCollectionModule(code).safe).toBe(false)
  })

  it('does not confuse user copy with registration code', () => {
    expect(analyzeCollectionModule(`const text = 'onTest'; const title = 'HugeGrid';`)).toEqual({ imports: [], safe: true })
  })
})
