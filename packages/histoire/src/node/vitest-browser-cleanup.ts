import type { Vitest } from 'vitest/node'

/**
 * Cleanup options for a Vitest browser-mode run.
 */
export interface CleanupVitestBrowserRunOptions {
  label: string
  timeoutMs: number
}

interface VitestBrowserProviderLike {
  close?: () => Promise<void> | void
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
 * Prints extra cleanup diagnostics only when browser debugging is enabled.
 */
function debugVitestBrowserCleanup(...args: unknown[]) {
  if (process.env.HST_DEBUG_BROWSER) {
    console.log('[histoire:browser]', ...args)
  }
}

/**
 * Closes browser providers eagerly so Playwright pages do not outlive the run.
 */
async function closeVitestBrowserProviders(vitest: VitestLike) {
  const providers = getVitestBrowserProviders(vitest)

  await Promise.all(providers.map(async (provider) => {
    try {
      await provider.close?.()
    }
    catch (error) {
      debugVitestBrowserCleanup('cleanup:provider:close:error', error)
    }
  }))
}

/**
 * Cleans up a Vitest browser run and fails fast if shutdown gets stuck.
 */
export async function cleanupVitestBrowserRun(
  vitest: Vitest,
  options: CleanupVitestBrowserRunOptions,
) {
  const cleanupPromise = (async () => {
    await closeVitestBrowserProviders(vitest as VitestLike)
    await vitest.close()
  })()

  cleanupPromise.catch((error) => {
    debugVitestBrowserCleanup('cleanup:error', options.label, error)
  })

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${options.label} cleanup timed out after ${options.timeoutMs}ms.`))
      }, options.timeoutMs)
      timer.unref?.()

      cleanupPromise.then(resolve, reject)
    })
  }
  finally {
    clearTimeout(timer)
  }
}
