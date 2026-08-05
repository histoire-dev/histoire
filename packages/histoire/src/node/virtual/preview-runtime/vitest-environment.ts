import { DEV_MODULE_MOCKER_SNIPPET, MOCKER_HELPERS_SNIPPET } from '../mocker-snippet.js'

/**
 * Emits the Vitest preview environment bootstrap: the globals a Vitest browser
 * runner expects (`__vitest_worker__`, `__vitest_browser_runner__`) and the
 * `ModuleMocker` wiring — server interceptor + the dev-server mock RPC in dev,
 * MSW interceptor with the static mock runtime in build mode.
 *
 * When Vitest is unavailable the emitted `ensureVitestPreviewEnvironment` is a
 * no-op, so the rest of the runtime can call it unconditionally. That branch
 * emits NO body at all: the mocker classes and static-mock helpers it would
 * reference (`ModuleMocker`, `createMockInstance`, `createStaticPreviewMockRpc`…)
 * are only imported by the preamble when `hasVitestPreview` is true, so keeping
 * the body behind a runtime flag would leave the emitted module referencing
 * identifiers it never imported.
 *
 * @param hasVitestPreview True when the mocker modules resolved and were
 * imported by the preamble.
 */
export function previewVitestEnvironment(hasVitestPreview: boolean) {
  if (!hasVitestPreview) {
    return `async function ensureVitestPreviewEnvironment() {
  // Vitest is not installed in this project: nothing to bootstrap.
}`
  }

  return `${MOCKER_HELPERS_SNIPPET}

async function ensureVitestPreviewEnvironment() {
  globalThis.vi ??= {}
  globalThis.vitest ??= globalThis.vi

  globalThis.__vitest_worker__ ??= {
    config: {
      browser: {
        isolate: false,
        trackUnhandledErrors: false,
      },
      expect: {},
    },
    providedContext: {},
    filepath: '',
    current: null,
    ctx: {},
    metaEnv: import.meta.env,
    onCancel: () => {},
    onFilterStackTrace: stack => stack || '',
  }

  globalThis.__vitest_browser_runner__ ??= {}
  Object.assign(globalThis.__vitest_browser_runner__, {
    provider: 'preview',
    sessionId: 'histoire-preview',
    cleanups: [],
    config: globalThis.__vitest_worker__.config,
    viteConfig: {
      root: '/',
    },
    commands: {
      triggerCommand() {
        throw new Error('Vitest browser commands are not available in Histoire preview runtime.')
      },
    },
    wrapModule(loader) {
      return Promise.resolve().then(loader)
    },
    wrapDynamicImport(loader) {
      return globalThis.__vitest_mocker__?.wrapDynamicImport
        ? globalThis.__vitest_mocker__.wrapDynamicImport(loader)
        : loader()
    },
  })

  if (typeof globalThis.__vitest_mocker__?.queueMock === 'function') {
    return
  }

  if (import.meta.hot) {
    const mocker = ${DEV_MODULE_MOCKER_SNIPPET}
    enableManualMockPreload(mocker)
    globalThis.__vitest_mocker__ = mocker
    registerNativeFactoryResolver(mocker)
    return
  }

  const mocker = new ModuleMocker(
    new ModuleMockerMSWInterceptor({
      globalThisAccessor: '"__vitest_mocker__"',
      mswOptions: createStaticPreviewMswOptions(),
    }),
    createStaticPreviewMockRpc(),
    createMockInstance,
    { root: '' },
  )
  enableManualMockPreload(mocker)
  enableStaticPreviewMockInterception(mocker)
  globalThis.__vitest_mocker__ = mocker
}`
}
