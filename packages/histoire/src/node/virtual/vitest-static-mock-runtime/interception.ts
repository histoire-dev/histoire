import type { StaticPreviewMocker, StaticPreviewQueueMockArgs } from './types.js'
import { findStaticMockLoaderImportUrl, getTimestampedMockUrl } from './mock-urls.js'
import { getImportSpecifiers } from './module-ids.js'
import { waitForServiceWorkerController } from './service-worker.js'

/** Runs native dynamic import without Vite rewriting it through Vitest's wrapper. */
// eslint-disable-next-line no-new-func -- deliberate: hides the import() from Vite's transform so it stays native
const nativeDynamicImport = new Function('url', 'return import(url)') as <T>(url: string) => Promise<T>

/**
 * Extends Vitest's mock queue so imports wait for MSW to control the page.
 *
 * @param mocker Vitest's browser `ModuleMocker`, patched in place.
 */
export function enableStaticPreviewMockInterception(mocker: StaticPreviewMocker) {
  const originalQueueMock = mocker.queueMock.bind(mocker)
  const originalWrapDynamicImport = mocker.wrapDynamicImport.bind(mocker)

  mocker.queueMock = (...args: StaticPreviewQueueMockArgs) => {
    originalQueueMock(...args)

    const pendingRegistration = Array.from(mocker.queue).at(-1)
    if (!pendingRegistration) {
      return
    }

    const controllerPromise = pendingRegistration.then(async () => {
      await waitForServiceWorkerController()
    }).finally(() => {
      mocker.queue.delete(controllerPromise)
    })

    mocker.queue.add(controllerPromise)
  }

  mocker.wrapDynamicImport = (moduleFactory) => {
    const loaderSource = String(moduleFactory)
    const mockUrl = findStaticMockLoaderImportUrl(loaderSource, mocker.registry.keys())

    if (mockUrl) {
      return originalWrapDynamicImport(async () => {
        await waitForServiceWorkerController()
        return await nativeDynamicImport(getTimestampedMockUrl(mockUrl))
      })
    }

    // Vite rewrites some already-bundled local dynamic imports into
    // `Promise.resolve().then(...)`; waiting for the mock queue there can
    // deadlock while MSW itself is being imported during mock registration.
    if (!getImportSpecifiers(loaderSource).size) {
      return moduleFactory()
    }

    return originalWrapDynamicImport(moduleFactory)
  }
}
