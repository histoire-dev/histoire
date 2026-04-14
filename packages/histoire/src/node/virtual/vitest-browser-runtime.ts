import type { Context } from '../context.js'
import { hasProjectVitest } from '../util/has-vitest.js'
import { tryResolveVitestModule } from '../util/resolve-vitest-package.js'

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
import { ModuleMocker, ModuleMockerServerInterceptor } from ${JSON.stringify(vitestMockerBrowserId)}

function hotRpc(event, data) {
  const hot = import.meta.hot
  if (!hot) {
    throw new Error('Vitest mock RPC is unavailable without Vite HMR.')
  }

  hot.send(event, data)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      hot.off(\`\${event}:result\`, onResult)
      reject(new Error(\`Failed to resolve \${event} in time\`))
    }, 5_000)

    function onResult(result) {
      clearTimeout(timeout)
      hot.off(\`\${event}:result\`, onResult)
      resolve(result)
    }

    hot.on(\`\${event}:result\`, onResult)
  })
}

function registerNativeFactoryResolver(mocker) {
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
}

if (import.meta.hot && typeof globalThis.__vitest_mocker__?.queueMock !== 'function') {
  const mocker = new ModuleMocker(
    new ModuleMockerServerInterceptor(),
    {
      resolveId(id, importer) {
        return hotRpc('vitest:mocks:resolveId', { id, importer })
      },
      resolveMock(id, importer, options) {
        return hotRpc('vitest:mocks:resolveMock', { id, importer, options })
      },
      async invalidate(ids) {
        await hotRpc('vitest:mocks:invalidate', { ids })
      },
    },
    createMockInstance,
    { root: '/' },
  )

  enableManualMockPreload(mocker)
  globalThis.__vitest_mocker__ = mocker
  registerNativeFactoryResolver(mocker)
}
`
}
