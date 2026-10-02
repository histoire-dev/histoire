import { build, transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { generatePreviewRuntimeSource, HOSTILE_STORY_ID, previewRuntimeStubStoryFiles } from './utils/preview-runtime-source.js'

/**
 * Parses the source as an ES module, throwing on any syntax error. The preview
 * runtime is emitted as one giant template literal and never imported by the
 * test suite, so nothing else would catch a broken interpolation.
 */
function parseAsModule(source: string) {
  transformSync(source, { loader: 'js', format: 'esm' })
}

describe('preview runtime generation', () => {
  it('binds preview vendor imports to Histoire dependencies instead of consumer root', async () => {
    for (const hasVitest of [true, false]) {
      const source = generatePreviewRuntimeSource(hasVitest)
      const output = await build({ stdin: { contents: source, loader: 'js' }, format: 'esm', write: false, metafile: true })
      const imports = Object.values(output.metafile!.outputs).flatMap(value => value.imports.map(entry => entry.path))
      expect(imports.filter(path => path.includes('histoire-vendors') || path.startsWith('@histoire/vendors/'))).toEqual([
        '/stub/histoire-vendors/dist/client/b-floating-vue.js',
        '/stub/histoire-vendors/dist/client/b-pinia.js',
        '/stub/histoire-vendors/dist/client/b-vue.js',
      ])
    }
  })

  it('emits syntactically valid modules for both the vitest and plain branches', () => {
    // Hostile story ids (quotes, backslash, backtick, `${`, newline) are baked
    // into the metadata, the loader keys and the import specifiers.
    expect(() => parseAsModule(generatePreviewRuntimeSource(true))).not.toThrow()
    expect(() => parseAsModule(generatePreviewRuntimeSource(false))).not.toThrow()
  })

  it('only imports the vitest mocker packages when they resolved', () => {
    const withVitest = generatePreviewRuntimeSource(true)
    const withoutVitest = generatePreviewRuntimeSource(false)

    expect(withVitest).toContain('import { createMockInstance } from "/stub/node_modules/@vitest/spy/dist/index.js"')
    expect(withVitest).toContain('import { ModuleMocker, ModuleMockerMSWInterceptor } from "/stub/node_modules/@vitest/mocker/dist/browser.js"')
    expect(withVitest).toContain('import { createStaticPreviewMockRpc, createStaticPreviewMswOptions, enableStaticPreviewMockInterception } from "/stub/histoire/virtual/vitest-static-mock-runtime.js"')

    // Without vitest those modules do not exist — importing them would break
    // the whole sandbox, so nothing is imported.
    expect(withoutVitest).not.toContain('@vitest/spy')
    expect(withoutVitest).not.toContain('@vitest/mocker')
    expect(withoutVitest).not.toContain('import { createStaticPreviewMockRpc')
  })

  it('never references the vitest mocker identifiers it did not import', () => {
    const withVitest = generatePreviewRuntimeSource(true)
    const withoutVitest = generatePreviewRuntimeSource(false)

    // Every identifier the environment bootstrap uses comes from an import the
    // preamble only emits when vitest resolved. Emitting the body behind a
    // runtime flag instead would leave the module referencing undeclared
    // identifiers — a ReferenceError as soon as the flag is ever touched.
    for (const identifier of [
      'ModuleMocker',
      'ModuleMockerMSWInterceptor',
      'createMockInstance',
      'createStaticPreviewMockRpc',
      'createStaticPreviewMswOptions',
      'enableStaticPreviewMockInterception',
    ]) {
      expect(withoutVitest, identifier).not.toContain(identifier)
      // The vitest branch imports them AND uses them.
      expect(withVitest, identifier).toContain(identifier)
    }

    // The no-vitest bootstrap stays callable; the shared import session awaits it.
    expect(withoutVitest).toContain('async function ensureVitestPreviewEnvironment() {')
    expect(withoutVitest).toContain('ensureEnvironment: ensureVitestPreviewEnvironment')
    expect(withVitest).toContain('globalThis.__vitest_mocker__ = mocker')
  })

  it('escapes story ids used as module loader object keys', () => {
    const source = generatePreviewRuntimeSource()

    // The loader key must be a JSON.stringify-escaped string literal so a story
    // id containing a quote/backslash/backtick cannot break out of the key.
    expect(source).toContain(`${JSON.stringify(HOSTILE_STORY_ID)}: () => import(`)
    for (const file of previewRuntimeStubStoryFiles) {
      expect(source).toContain(`${JSON.stringify(file.id)}: () => import(${JSON.stringify(file.moduleId)})`)
    }
    // The previous unescaped single-quote key form must be gone.
    expect(source).not.toContain(`'${HOSTILE_STORY_ID}':`)
  })

  it('consumes the echo guard before the ready gate in the variant state watcher', () => {
    const source = generatePreviewRuntimeSource()

    // The host syncs state while the variant is still pending; if the watcher
    // returns on the ready gate before consuming, that suppression stays
    // armed and swallows the first genuine in-story mutation after ready.
    const watcherBody = source.slice(source.indexOf('const stop = watch(() => targetVariant.state'))
    const consumeIndex = watcherBody.indexOf('variantStateGuards.consume(key)')
    const readyIndex = watcherBody.indexOf('readyVariantIds.has(targetVariant.id)')

    expect(consumeIndex).toBeGreaterThan(-1)
    expect(readyIndex).toBeGreaterThan(-1)
    expect(consumeIndex).toBeLessThan(readyIndex)
  })

  it('does not use a synchronous flush for the per-variant state watcher', () => {
    // A sync flush makes the watcher fire once per mutated key during applyState,
    // which consumes the single suppression and leaks partial-state echoes to the host.
    expect(generatePreviewRuntimeSource()).not.toContain('flush: \'sync\'')
  })

  it('posts to the current origin only — never a wildcard or the referrer origin', () => {
    const source = generatePreviewRuntimeSource()

    // postToParent must post to our own origin: never '*' (leaks to any origin)
    // and never a document.referrer-derived origin (leaks state/test payloads to
    // a hostile page that embeds the same-origin sandbox).
    expect(source).not.toContain('let targetOrigin = \'*\'')
    expect(source).not.toContain('new URL(document.referrer)')
    expect(source).toContain('}, window.location.origin)')
  })

  it('reports collection crashes in the TEST_DEFINITIONS reply', () => {
    // The COLLECT_TESTS catch reply must carry the serialized error so the
    // host UI can distinguish "no tests registered" from "collection crashed".
    expect(generatePreviewRuntimeSource()).toContain('error: serializeTestError(error)')
  })

  it('renders session mounts off-screen so collect/run does not flash a second story copy', () => {
    // The preview iframe already shows the story; the test session's render
    // mount must never appear as a visible duplicate over it.
    expect(generatePreviewRuntimeSource()).toContain('offscreenRenderMount: true')
  })
})
