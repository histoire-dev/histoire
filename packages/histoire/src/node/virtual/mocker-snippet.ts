import { VITEST_MOCK_RPC_METHODS } from '../vitest-mock-rpc.js'

/**
 * Generated-code helpers installed around Vitest's `ModuleMocker`, embedded
 * verbatim by both browser runtimes (the story preview iframe and the app
 * shell): they do the same job in two windows, so they are emitted from one
 * source instead of being kept in sync by hand.
 *
 * - `registerNativeFactoryResolver` answers the mocker's factory-resolution
 *   requests over the HMR channel,
 * - `enableManualMockPreload` resolves `__mocks__` files eagerly, so a module
 *   mocked with a factory is already registered when the story imports it.
 */
export const MOCKER_HELPERS_SNIPPET = `function registerNativeFactoryResolver(mocker) {
  const hot = import.meta.hot
  if (!hot) {
    return
  }

  hot.on('vitest:interceptor:resolve', async url => {
    const exports = await mocker.resolveFactoryModule(url)
    hot.send('vitest:interceptor:resolved', {
      url,
      keys: Object.keys(exports),
    })
  })
}

function enableManualMockPreload(mocker) {
  const originalQueueMock = mocker.queueMock.bind(mocker)

  mocker.queueMock = (rawId, importer, factoryOrOptions) => {
    originalQueueMock(rawId, importer, factoryOrOptions)

    if (typeof factoryOrOptions !== 'function') {
      return
    }

    const pendingRegistration = Array.from(mocker.queue).at(-1)
    if (!pendingRegistration) {
      return
    }

    const preloadPromise = pendingRegistration.then(async () => {
      for (const mockUrl of mocker.registry.keys()) {
        const mock = mocker.registry.get(mockUrl)
        if (mock?.type === 'manual' && !mock.cache) {
          await mock.resolve()
        }
      }
    }).finally(() => {
      mocker.queue.delete(preloadPromise)
    })

    mocker.queue.add(preloadPromise)
  }
}`

/**
 * Generated expression creating the dev-mode `ModuleMocker`: mock resolution
 * goes through Histoire's own HTTP RPC (see `mock-rpc-snippet.ts`) rather than
 * Vitest's HMR-based transport.
 *
 * Expects `ModuleMocker`, `createMockInstance`, `createMockInterceptor` and
 * `mockRpc` to be in scope, and to be evaluated under `import.meta.hot`.
 */
export const DEV_MODULE_MOCKER_SNIPPET = `new ModuleMocker(
    createMockInterceptor(import.meta.hot, mockRpc),
    {
      resolveId(id, importer) {
        return mockRpc(${JSON.stringify(VITEST_MOCK_RPC_METHODS.resolveId)}, { id, importer })
      },
      resolveMock(id, importer, options) {
        return mockRpc(${JSON.stringify(VITEST_MOCK_RPC_METHODS.resolveMock)}, { id, importer, options })
      },
      async invalidate(ids) {
        await mockRpc(${JSON.stringify(VITEST_MOCK_RPC_METHODS.invalidate)}, { ids })
      },
    },
    createMockInstance,
    { root: '/' },
  )`
