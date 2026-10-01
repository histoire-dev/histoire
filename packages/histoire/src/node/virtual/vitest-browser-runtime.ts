import type { Context } from '../context.js'
import { hasProjectVitest } from '../util/has-vitest.js'
import { tryResolveVitestModule } from '../util/resolve-vitest-package.js'
import { MOCK_RPC_SNIPPET } from './mock-rpc-snippet.js'
import { DEV_MODULE_MOCKER_SNIPPET, MOCKER_HELPERS_SNIPPET } from './mocker-snippet.js'

/**
 * Emits `virtual:$histoire-vitest-browser-runtime`, imported by the Histoire app
 * shell (`@histoire/app` `src/app/index.ts`) and by nothing else.
 *
 * Where this actually runs — the name is about the *Vitest* browser mocker, not
 * about `histoire test`:
 * - `histoire dev`: the app dev server serves this module with `import.meta.hot`
 *   set and carries Histoire's mock RPC plugin, so the `ModuleMocker` below is
 *   installed and functional in the app's own (top) window. It is the only
 *   mocker that window ever gets: `util/vitest-mocker-shim.ts` runs first and
 *   only guarantees a passthrough `wrapDynamicImport`, which has no `queueMock`.
 * - `histoire build`: the module is emitted into the bundle, but its whole body
 *   is behind `import.meta.hot`, which is `undefined` in a production build — so
 *   the bundler drops it and nothing runs.
 * - `histoire test` / story collection: never loaded at all. Those runs execute
 *   generated specs whose graph is `virtual:$histoire-test-harness` (or the
 *   generated collector), never the app shell — and real Vitest browser mode
 *   installs its own `__vitest_mocker__` there anyway, which is what makes
 *   `vi.mock` work in stories under `histoire test`.
 *
 * The app window mounts story modules (`GenericMountStory` in `App.vue`) for
 * every story whose source has no detectable `vi.mock(...)`. That detection is
 * a source regex (`fileHasVitestMocks`), so a story mocking indirectly — a
 * shared helper calling `vi.doMock`, an aliased `vi` — still executes here, and
 * this mocker is what keeps it from throwing "Vitest mocker was not initialized
 * in this environment".
 *
 * Shares its mocker bootstrap (`mocker-snippet.ts`) with the preview runtime's
 * own (`preview-runtime/vitest-environment.ts`), which does the same job inside
 * the story sandbox iframes.
 * @param ctx The histoire context, used to resolve the project's Vitest.
 */
export function vitestBrowserRuntime(ctx: Context) {
  const hasVitest = hasProjectVitest(ctx.root)
  const vitestSpyId = tryResolveVitestModule(ctx.root, '@vitest/spy')
  const vitestMockerBrowserId = tryResolveVitestModule(ctx.root, '@vitest/mocker/browser')
  const hasVitestPreview = hasVitest && vitestSpyId && vitestMockerBrowserId

  if (!hasVitestPreview) {
    return 'export {}'
  }

  return `
import { createMockInstance } from ${JSON.stringify(vitestSpyId)}
import { ModuleMocker } from ${JSON.stringify(vitestMockerBrowserId)}

${MOCK_RPC_SNIPPET}

${MOCKER_HELPERS_SNIPPET}

if (import.meta.hot && typeof globalThis.__vitest_mocker__?.queueMock !== 'function') {
  const mocker = ${DEV_MODULE_MOCKER_SNIPPET}

  enableManualMockPreload(mocker)
  globalThis.__vitest_mocker__ = mocker
  registerNativeFactoryResolver(mocker)
}
`
}
