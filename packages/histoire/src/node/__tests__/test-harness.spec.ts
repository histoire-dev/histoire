import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestHarnessSource } from '../virtual/test-harness.js'
import { HOSTILE_STORY_ID, previewRuntimeStubStoryFiles } from './utils/preview-runtime-source.js'

/**
 * Behavioral tests for the generated browser test harness module.
 *
 * The harness is emitted as source text, so it is compiled here and executed
 * with its only real import stubbed: that proves the baked story metadata and
 * module loaders survive generation intact, including story ids/paths carrying
 * quotes, backslashes, backticks and `${` — which used to break out of the
 * emitted literals.
 */

const STUB_SESSION_ID = '/stub/histoire/virtual/variant-test-session.js'

/** What the generated module handed to `createVariantTestSession`. */
interface HarnessSessionOptions {
  files: { id: string, moduleId: string }[]
  moduleLoaders: Record<string, () => Promise<unknown>>
  runWithDynamicImport: (loader: () => any) => any
}

/** Generates the harness for the shared stub story files. */
function generateHarness(files = previewRuntimeStubStoryFiles) {
  return buildTestHarnessSource({ variantTestSessionId: STUB_SESSION_ID, files })
}

/**
 * Compiles and runs the generated harness, returning the options it built.
 *
 * @param source Generated harness module source.
 */
function evaluateHarness(source: string): HarnessSessionOptions {
  const { code } = transformSync(source, { loader: 'js', format: 'cjs' })

  let captured: HarnessSessionOptions | undefined
  const requireStub = (id: string) => {
    if (id === STUB_SESSION_ID) {
      return {
        createVariantTestSession: (options: HarnessSessionOptions) => {
          captured = options
          return {}
        },
      }
    }
    // `virtual:$histoire-theme` is a side-effect-only style import.
    return {}
  }

  const moduleShim = { exports: {} as Record<string, unknown> }
  // eslint-disable-next-line no-new-func -- executing the generated module is the point of this spec
  new Function('require', 'module', 'exports', code)(requireStub, moduleShim, moduleShim.exports)

  if (!captured) {
    throw new Error('the generated harness never created a variant test session')
  }
  return captured
}

describe('test harness generator', () => {
  afterEach(() => {
    // The harness installs the global vitest aliases at module scope.
    delete (globalThis as any).vi
    delete (globalThis as any).vitest
  })

  it('bakes one module loader per story, keyed by the exact story id', () => {
    const { files, moduleLoaders } = evaluateHarness(generateHarness())

    expect(Object.keys(moduleLoaders)).toEqual(previewRuntimeStubStoryFiles.map(file => file.id))
    // Including the id packed with quotes, a backslash, a backtick and a `${`
    // interpolation opener: it must arrive as one intact key, not as code.
    expect(moduleLoaders[HOSTILE_STORY_ID]).toBeTypeOf('function')
    expect(files.map(file => file.id)).toEqual(previewRuntimeStubStoryFiles.map(file => file.id))
  })

  it('round-trips the baked story metadata unchanged', () => {
    const { files } = evaluateHarness(generateHarness())

    // The whole metadata blob crosses into the browser through this literal;
    // any escaping mistake shows up as a mangled title/path here.
    expect(files).toEqual(JSON.parse(JSON.stringify(previewRuntimeStubStoryFiles)))
  })

  it('routes loaders through the vitest dynamic-import wrapper when one exists', () => {
    const { runWithDynamicImport } = evaluateHarness(generateHarness())

    // Without the wrapper the browser runner cannot attribute the imported
    // module to the running test, so mocks registered for it are ignored.
    ;(globalThis as any).__vitest_browser_runner__ = {
      wrapDynamicImport: (loader: () => any) => `wrapped:${loader()}`,
    }
    try {
      expect(runWithDynamicImport(() => 'module')).toBe('wrapped:module')
    }
    finally {
      delete (globalThis as any).__vitest_browser_runner__
    }

    // Outside a Vitest browser run the loader is simply called.
    expect(runWithDynamicImport(() => 'module')).toBe('module')
  })

  it('generates an empty but valid harness when no story was collected', () => {
    const { files, moduleLoaders } = evaluateHarness(generateHarness([]))

    expect(files).toEqual([])
    expect(Object.keys(moduleLoaders)).toEqual([])
  })
})
