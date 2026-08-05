import type { Vitest } from 'vitest/node'
import { debugVitestBrowser } from './util/browser-debug.js'
import { forceKillPlaywrightBrowser } from './util/playwright-kill.js'

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
    }
  }))
}

/**
 * Force-kills the browser processes of a run whose cleanup got stuck.
 * Never throws: a failed kill must not turn cleanup into a run failure.
 * @param browsers Browser handles captured before cleanup started.
 * @returns How many browser processes were actually signalled.
 */
function hardKillVitestBrowsers(browsers: Iterable<unknown>): number {
  let killed = 0

  for (const browser of browsers) {
    try {
      if (forceKillPlaywrightBrowser(browser)) {
        killed++
      }
    }
    catch (error) {
      debugVitestBrowser('cleanup:hard-kill:error', error)
    }
  }

  return killed
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
) {
  const providers = getVitestBrowserProviders(vitest as VitestLike)
  // Capture the browser handles up front: the Playwright provider clears
  // `provider.browser` at the very start of `close()`, so a stuck close would
  // leave no reachable handle to kill.
  const browsers = new Set(providers.map(provider => provider.browser).filter(Boolean))

  const cleanupPromise = (async () => {
    await closeVitestBrowserProviders(providers)
    await vitest.close()
  })()

  cleanupPromise.catch((error) => {
    debugVitestBrowser('cleanup:error', options.label, error)
  })

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        // Best-effort: a stuck teardown should not fail an already-successful
        // run. Surface a warning and resolve instead of rejecting.
        const killed = hardKillVitestBrowsers(browsers)
        const message = `${options.label} cleanup timed out after ${options.timeoutMs}ms.${
          killed
            ? ` Force killed ${killed} browser process(es).`
            : ' Its browser could not be force killed (no reachable process handle) and may still be running.'
        }`
        debugVitestBrowser('cleanup:timeout', message)
        console.warn(message)
        resolve()
      }, options.timeoutMs)
      timer.unref?.()

      // A real cleanup failure still rejects and propagates to the caller.
      cleanupPromise.then(resolve, reject)
    })
  }
  finally {
    clearTimeout(timer)
  }
}
