import { describe, expect, it, vi } from 'vitest'
import { findStaticMockImportUrl, findStaticMockLoaderImportUrl } from '../virtual/vitest-static-mock-runtime/index.js'

describe('static preview Vitest mock resolver', () => {
  it('maps a raw relative mock id to the hashed Vite build chunk', () => {
    const source = `
const __vi_import_0__ = await globalThis["__vitest_browser_runner__"].wrapDynamicImport(() => import("./vitest-mocking-greeting-BEPFcrgl.js"))
const __vi_import_1__ = await globalThis["__vitest_browser_runner__"].wrapDynamicImport(() => import("./VitestMockedGreeting-BUBNcCo-.js"))
`

    expect(findStaticMockImportUrl(
      source,
      './vitest-mocking-greeting',
      'http://localhost:4567/assets/VitestMocking.story-DyDFV3C-.js',
    )).toBe('/assets/vitest-mocking-greeting-BEPFcrgl.js')
  })

  it('disambiguates a raw mock id against same-basename chunks by parent directory', () => {
    // `src/a/config.ts` and `src/b/config.ts` emit two chunks whose basenames
    // both normalize to `config`.
    const source = `
import { a } from "./a/config-A1b2C3d4.js"
import { b } from "./b/config-Z9y8X7w6.js"
`

    expect(findStaticMockImportUrl(
      source,
      '../features/b/config',
      'http://localhost:4567/assets/Example.story-DyDFV3C-.js',
    )).toBe('/assets/b/config-Z9y8X7w6.js')
  })

  it('refuses to bind a raw mock id to an ambiguous same-basename chunk', () => {
    // Both chunks are flat siblings, so nothing tells them apart: picking the
    // first match would silently mock an entirely different module.
    const source = `
import { a } from "./utils-A1b2C3d4.js"
import { b } from "./utils-Z9y8X7w6.js"
`
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(findStaticMockImportUrl(
      source,
      './utils',
      'http://localhost:4567/assets/Example.story-DyDFV3C-.js',
    )).toBe(null)
    // Silently dropping the mock would look like a broken test instead of a
    // build-layout problem.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"./utils"'))
    warnSpy.mockRestore()
  })

  it('maps a Vite preload loader to an already registered mock URL', () => {
    const loaderSource = '() => __vitePreload(() => import("./vitest-mocking-greeting-BEPFcrgl.js"), true ? [] : void 0)'

    expect(findStaticMockLoaderImportUrl(loaderSource, [
      '/assets/vitest-mocking-greeting-BEPFcrgl.js',
    ])).toBe('/assets/vitest-mocking-greeting-BEPFcrgl.js')
  })

  it('disambiguates same-basename mocks by parent directory', () => {
    const loaderSource = '() => __vitePreload(() => import("../features/b/config-A1b2C3d4.js"), true ? [] : void 0)'

    expect(findStaticMockLoaderImportUrl(loaderSource, [
      '/assets/a/config-A1b2C3d4.js',
      '/assets/b/config-A1b2C3d4.js',
    ])).toBe('/assets/b/config-A1b2C3d4.js')
  })

  it('returns null instead of guessing when same-basename mocks stay ambiguous', () => {
    // A wrong pick would silently redirect the dynamic import to a different
    // module's mock — bailing out falls back to plain URL resolution.
    const loaderSource = '() => import("./config-A1b2C3d4.js")'

    expect(findStaticMockLoaderImportUrl(loaderSource, [
      '/assets/a/config-A1b2C3d4.js',
      '/assets/b/config-A1b2C3d4.js',
    ])).toBe(null)
  })

  it('keeps real word segments while stripping build hashes', () => {
    // 'settings' contains no digit, so 'preview-settings' is a real name —
    // only digit-bearing suffixes look like Vite build hashes.
    const loaderSource = '() => import("./preview-settings.js")'

    expect(findStaticMockLoaderImportUrl(loaderSource, [
      '/assets/preview.js',
      '/assets/preview-settings.js',
    ])).toBe('/assets/preview-settings.js')
  })
})
