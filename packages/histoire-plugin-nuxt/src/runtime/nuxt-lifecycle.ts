/** Vue app owns lifecycle even when setup fails before its first mount. */
interface NuxtLifecycleApp {
  /** Normal mounted-app teardown hook. */
  onUnmount?: (callback: () => void) => void
  /** Internal idempotent fallback invoked by preview host on failed setup. */
  __HST_NUXT_CLEANUP__?: () => void
  /** Actual owning Vue app supplies mount and resolved-Suspense boundaries. */
  __HST_NUXT_LIFECYCLE__?: (stage: NuxtMountStage) => Promise<void>
}

/** Nuxt hooks that normally belong to its document entry/root. */
type NuxtMountStage = 'app:beforeMount' | 'app:mounted' | 'app:suspense:resolve'

/** Register scope/context resources before asynchronous plugin acquisition. */
export async function initializeNuxtPreviewLifecycle(app: NuxtLifecycleApp, scope: { stop: () => void }, clearContext: () => void, setup: () => Promise<void>, lifecycle?: (stage: NuxtMountStage) => Promise<void>): Promise<void> {
  let closed = false
  /** Both plugin failure and actual app unmount share one resource release. */
  const cleanup = () => {
    if (closed) return
    closed = true
    delete app.__HST_NUXT_LIFECYCLE__
    try {
      scope.stop()
    }
    finally {
      clearContext()
    }
  }
  app.__HST_NUXT_CLEANUP__ = cleanup
  app.__HST_NUXT_LIFECYCLE__ = async (stage) => {
    if (closed) return
    try {
      await lifecycle?.(stage)
    }
    catch (error) {
      cleanup()
      throw error
    }
  }
  app.onUnmount?.(cleanup)
  try {
    await setup()
  }
  catch (error) {
    cleanup()
    throw error
  }
}
