/** How long to wait for MSW's worker to claim the page before giving up (ms). */
const CONTROLLER_TIMEOUT = 1000

/**
 * Returns MSW options scoped to the built Histoire base path.
 */
export function createStaticPreviewMswOptions() {
  return {
    serviceWorker: {
      url: new URL('mockServiceWorker.js', window.location.href).pathname,
    },
  }
}

/** Waits until MSW's worker can intercept module script requests on this page. */
export async function waitForServiceWorkerController() {
  if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller) {
    return
  }

  await navigator.serviceWorker.ready.catch(() => null)
  if (navigator.serviceWorker.controller) {
    return
  }

  await new Promise<void>((resolve) => {
    let timeout: number
    const onControllerChange = () => {
      window.clearTimeout(timeout)
      resolve()
    }

    timeout = window.setTimeout(() => {
      // Remove the listener too: with one preview boot per story navigation,
      // leaving one behind per timed-out wait accumulates listeners on the
      // page-wide service worker container for as long as the tab lives.
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      console.warn(`Histoire: the mock service worker did not claim this page within ${CONTROLLER_TIMEOUT}ms. Mocked modules may load unmocked.`)
      resolve()
    }, CONTROLLER_TIMEOUT)

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
      once: true,
    })
  })
}
