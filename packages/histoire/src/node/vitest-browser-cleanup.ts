import type { Vitest } from 'vitest/node'
import { debugVitestBrowser } from './util/browser-debug.js'
import { terminatePlaywrightBrowser } from './util/playwright-cleanup.js'
import { getPlaywrightBrowserProcess } from './util/playwright-kill.js'

/**
 * Cleanup options for a Vitest browser-mode run.
 */
export interface CleanupVitestBrowserRunOptions {
  label: string
  timeoutMs: number
}

interface VitestBrowserProviderLike {
  close?: () => Promise<void> | void
  /**
   * Playwright browser handle. The provider nulls it as soon as `close()`
   * starts, so it can only be captured before cleanup begins.
   */
  browser?: unknown
}

interface VitestProjectLike {
  browser?: {
    provider?: VitestBrowserProviderLike
  }
}

interface VitestLike extends Pick<Vitest, 'close'> {
  projects?: VitestProjectLike[]
  coreWorkspaceProject?: VitestProjectLike
}

/**
 * Returns all Vitest workspace projects, including the core workspace project.
 */
function getVitestWorkspaceProjects(vitest: VitestLike): VitestProjectLike[] {
  const projects = Array.isArray(vitest.projects) ? [...vitest.projects] : []
  const coreWorkspaceProject = vitest.coreWorkspaceProject

  if (coreWorkspaceProject && !projects.includes(coreWorkspaceProject)) {
    projects.push(coreWorkspaceProject)
  }

  return projects
}

/**
 * Collects unique browser providers that need to be closed before `vitest.close()`.
 */
function getVitestBrowserProviders(vitest: VitestLike): VitestBrowserProviderLike[] {
  return [
    ...new Set(
      getVitestWorkspaceProjects(vitest)
        .map(project => project.browser?.provider)
        .filter((provider): provider is VitestBrowserProviderLike => Boolean(provider)),
    ),
  ]
}

/**
 * Closes browser providers eagerly so Playwright pages do not outlive the run.
 * @param providers Providers of the run being cleaned up.
 */
async function closeVitestBrowserProviders(providers: VitestBrowserProviderLike[]) {
  await Promise.all(providers.map(async (provider) => {
    try {
      await provider.close?.()
    }
    catch (error) {
      debugVitestBrowser('cleanup:provider:close:error', error)
      throw error
    }
  }))
}

/** Confirmed outcome consumed by controller-owned execution lanes. */
export interface VitestCleanupOutcome {
  /** Unconfirmed cleanup cannot safely release a long-lived execution lane. */
  status: 'graceful' | 'forced' | 'unconfirmed'
}

/** Observe a cleanup promise under a bound without discarding late rejection. */
async function waitForCleanup(work: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
        timer.unref?.()
      }),
    ])
  }
  finally { clearTimeout(timer) }
}

/**
 * Cleans up a Vitest browser run.
 *
 * A slow teardown is treated as best-effort: if cleanup does not finish before
 * `timeoutMs`, the run resolves with a warning rather than failing an otherwise
 * successful run. A genuine cleanup error (the cleanup promise rejecting) is
 * still propagated.
 *
 * Because the dev server outlives the run, a stuck teardown would otherwise
 * strand a headless browser per run, so the timeout also force-kills the
 * browser processes it captured before cleanup started.
 */
export async function cleanupVitestBrowserRun(
  vitest: Vitest,
  options: CleanupVitestBrowserRunOptions,
): Promise<VitestCleanupOutcome> {
  const providers = getVitestBrowserProviders(vitest as VitestLike)
  // Providers clear this handle as close begins. Capture only owned browsers first.
  const browsers = new Map(providers.filter(provider => provider.browser).map(provider => [provider.browser, getPlaywrightBrowserProcess(provider.browser)]))
  const cleanupPromise = (async () => {
    await closeVitestBrowserProviders(providers)
    await vitest.close()
  })()
  cleanupPromise.catch(error => debugVitestBrowser('cleanup:error', options.label, error))
  if (await waitForCleanup(cleanupPromise, options.timeoutMs)) return { status: 'graceful' }

  let confirmed = browsers.size > 0
  for (const [browser, child] of browsers) {
    try {
      await terminatePlaywrightBrowser(browser, Math.min(2500, options.timeoutMs), child)
    }
    catch (error) {
      confirmed = false
      debugVitestBrowser('cleanup:hard-kill:error', error)
    }
  }
  // Browser exit alone does not confirm Vite sockets/workers were released.
  const stopped = confirmed && await waitForCleanup(cleanupPromise, Math.min(2500, options.timeoutMs))
  console.warn(`${options.label} cleanup timed out after ${options.timeoutMs}ms. ${
    stopped ? `Force killed ${browsers.size} browser process(es).` : 'Its runner teardown could not be confirmed.'
  }`)
  return { status: stopped ? 'forced' : 'unconfirmed' }
}
