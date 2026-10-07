import { fileURLToPath } from 'node:url'
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
  it('keeps grid-only modules behind selection readiness', () => {
    const source = generatePreviewRuntimeSource()
    const gridModule = '/stub/histoire-app/dist/bundled/components/story/StoryVariantGridSandbox.vue.js'

    expect(source).not.toContain(`import StoryVariantGridSandbox from ${JSON.stringify(gridModule)}`)
    expect(source).toContain(`await import(${JSON.stringify(gridModule)})`)

    const selectionStart = source.indexOf('async function syncSelection(nextSelection)')
    const selectionEnd = source.indexOf('async function handleRuntimeRequest', selectionStart)
    const selection = source.slice(selectionStart, selectionEnd)
    const dependencies = selection.indexOf('Promise.allSettled')
    const gridLoad = selection.indexOf('nextGrid ? ensureGridComponent()')
    const storyMount = selection.indexOf('file.value = nextFile')
    expect(dependencies).toBeGreaterThanOrEqual(0)
    expect(gridLoad).toBeGreaterThan(dependencies)
    expect(storyMount).toBeGreaterThan(dependencies)

    const previewSyncStart = source.indexOf('if (event.data?.type === PREVIEW_SYNC)')
    const previewSyncEnd = source.indexOf('else if (event.data?.type === STATE_SYNC)', previewSyncStart)
    const previewSync = source.slice(previewSyncStart, previewSyncEnd)
    expect(previewSync.indexOf('await syncSelection(event.data)')).toBeLessThan(previewSync.indexOf('postToParent({ type: SANDBOX_READY'))
  })

  it('links built runtime and public app entries without the legacy routing state graph', async () => {
    const appDirectory = fileURLToPath(new URL('../../../../histoire-app/dist/', import.meta.url))
    const source = generatePreviewRuntimeSource().replaceAll('/stub/histoire-app/dist/', appDirectory)
    const output = await build({
      stdin: {
        contents: `${source}
export { logEvent, isDark, toggleDark, useHostChannel, useHistoireGlobals, useHistoireGlobalsStore } from ${JSON.stringify(`${appDirectory}bundle-index.js`)}
import ${JSON.stringify(`${appDirectory}bundled/reusable.js`)}
import ${JSON.stringify(`${appDirectory}bundled/index.js`)}
`,
        loader: 'js',
        resolveDir: appDirectory,
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      metafile: true,
      plugins: [{
        name: 'retained-app-output-boundary',
        /** Link app outputs while preserving their virtual/package boundaries. */
        setup(builder) {
          // Only app outputs belong to this check. Virtual story/test modules
          // and package dependencies have their own runtime/consumer fixtures.
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.path.startsWith(appDirectory) || args.path.startsWith('.')) return
            return { path: args.path, external: true }
          })
        },
      }],
    })
    const modules = Object.keys(output.metafile!.inputs).join('\n')
    // Dynamic imports are traversed too: logEvent's lazy compatibility store
    // must never pull route views or a second selected-story owner into clients.
    expect(modules).not.toMatch(/histoire-app\/dist\/bundled\/(?:router\.js|stores\/(?:story|folder|tests|preview-runtime)\.js)/)
    expect(modules).not.toMatch(/histoire-app\/dist\/bundled\/components\/(?:panel|search|tree)\//)
    const exports = Object.values(output.metafile!.outputs).flatMap(value => value.exports)
    expect(exports).toEqual(expect.arrayContaining(['logEvent', 'isDark', 'toggleDark', 'useHostChannel', 'useHistoireGlobals', 'useHistoireGlobalsStore']))
  })

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

  it('probes actual setup exports before allowing the trusted empty shortcut', () => {
    const source = generatePreviewRuntimeSource()

    expect(source).toContain('import(\'virtual:$histoire-generated-global-setup\')')
    expect(source).toContain('import(\'virtual:$histoire-setup\')')
    expect(source).toContain('hasVanillaSetupHooks(generatedSetup, setup)')
    expect(source).toContain('  canSkipKnownEmptyCollection,')
  })
})
