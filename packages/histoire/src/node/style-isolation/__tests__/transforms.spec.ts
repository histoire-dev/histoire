import { describe, expect, it } from 'vitest'
import { isGlobalImport, wrapChromeCss, wrapUserCss } from '../transforms.js'

describe('wrapUserCss', () => {
  it('wraps a single rule in @scope (.scope-root)', () => {
    const out = wrapUserCss('body { color: red }', { scopeRoot: '.__histoire-render-story' })
    expect(out).toContain('@scope (.__histoire-render-story)')
    expect(out).toContain('body')
    expect(out).toContain('color: red')
  })

  it('rewrites :root → :scope inside the scope', () => {
    const out = wrapUserCss(':root { --color-primary: blue }', {
      scopeRoot: '.__histoire-render-story',
    })
    expect(out).toContain(':scope')
    expect(out).not.toContain(':root')
    expect(out).toContain('--color-primary: blue')
  })

  it('leaves :scope alone (idempotent)', () => {
    const out = wrapUserCss(':scope { color: red }', {
      scopeRoot: '.__histoire-render-story',
    })
    expect(out).toContain(':scope')
    expect(out).not.toContain(':scope:scope')
  })

  it('hoists @import outside the @scope block', () => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=Foo');\nbody { color: red }`
    const out = wrapUserCss(css, { scopeRoot: '.__histoire-render-story' })
    expect(out.indexOf('@import')).toBeLessThan(out.indexOf('@scope'))
  })

  it('does not double-wrap CSS that already starts with @scope', () => {
    const input = wrapUserCss('body { color: red }', { scopeRoot: '.__histoire-render-story' })
    const out = wrapUserCss(input, { scopeRoot: '.__histoire-render-story' })
    const occurrences = (out.match(/@scope/g) ?? []).length
    expect(occurrences).toBe(1)
  })
})

describe('wrapChromeCss', () => {
  it('wraps in @scope (root) to (lower)', () => {
    const out = wrapChromeCss('body { color: red }', {
      scopeRoot: '.histoire-app-root',
      scopeLower: '.__histoire-render-story',
    })
    expect(out).toContain('@scope (.histoire-app-root) to (.__histoire-render-story)')
    expect(out).toContain('body')
  })

  it('hoists @import to the top, outside @scope', () => {
    const css = `@import url('reset.css');\nbody { color: red }`
    const out = wrapChromeCss(css, {
      scopeRoot: '.histoire-app-root',
      scopeLower: '.__histoire-render-story',
    })
    const importIdx = out.indexOf('@import')
    const scopeIdx = out.indexOf('@scope')
    expect(importIdx).toBeGreaterThanOrEqual(0)
    expect(scopeIdx).toBeGreaterThan(importIdx)
  })

  it('hoists @font-face above @scope', () => {
    const css = `@font-face { font-family: A; src: url('a.woff2') }\nbody { font-family: A }`
    const out = wrapChromeCss(css, {
      scopeRoot: '.histoire-app-root',
      scopeLower: '.__histoire-render-story',
    })
    expect(out.indexOf('@font-face')).toBeLessThan(out.indexOf('@scope'))
  })

  it('preserves an arbitrary scopeLower selector in the @scope prelude', () => {
    const out = wrapChromeCss('body { color: red }', {
      scopeRoot: '.histoire-app-root',
      scopeLower: '.__histoire-render-story:not(.__histoire-render-custom-controls)',
    })
    expect(out).toContain('@scope (.histoire-app-root) to (.__histoire-render-story:not(.__histoire-render-custom-controls))')
  })
})

describe('isGlobalImport', () => {
  it('returns true for ids ending in ?global', () => {
    expect(isGlobalImport('/abs/path/foo.css?global')).toBe(true)
    expect(isGlobalImport('foo.css?global&bar')).toBe(true)
  })
  it('returns false otherwise', () => {
    expect(isGlobalImport('/abs/path/foo.css')).toBe(false)
    expect(isGlobalImport('foo.css?inline')).toBe(false)
  })
})
