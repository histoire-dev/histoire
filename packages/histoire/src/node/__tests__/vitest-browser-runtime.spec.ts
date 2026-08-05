import type { Context } from '../context.js'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { vitestBrowserRuntime } from '../virtual/vitest-browser-runtime.js'

/**
 * The app-shell mocker runtime is emitted as source text and only ever executes
 * inside a browser (behind `import.meta.hot`), so this spec compiles it to
 * prove it is valid, self-contained JavaScript — the one check the other
 * generated runtimes already have and this one lacked.
 */

function createContext(): Context {
  return {
    root: process.cwd(),
    config: {} as Context['config'],
    resolvedViteConfig: {} as Context['resolvedViteConfig'],
    mode: 'dev',
    storyFiles: [],
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }
}

describe('vitestBrowserRuntime', () => {
  it('emits a parseable module wiring the mocker behind import.meta.hot', () => {
    const source = vitestBrowserRuntime(createContext())

    // Parses as an ES module (top-level `import.meta` and imports included).
    expect(() => transformSync(source, { loader: 'js', format: 'esm' })).not.toThrow()

    // The whole body is gated: in a build `import.meta.hot` is undefined and
    // the bundler drops it, so nothing may run at module scope unguarded.
    expect(source).toContain('if (import.meta.hot && typeof globalThis.__vitest_mocker__?.queueMock !== \'function\')')
    expect(source).toContain('globalThis.__vitest_mocker__ = mocker')
  })
})
