import type { Vitest } from 'vitest/node'
import { prepareVitestCollectionProvider } from '../vitest-browser-config/browser-project.js'
import { debugVitestBrowser } from './browser-debug.js'
import { finishClientOptimization, warmClientModules } from './client-optimizer.js'

/**
 * Finish entry scanning and initial prebundling before isolated tester documents open.
 * @param vitest The attempt-local runner.
 * @param runId Optional collection operation identity for diagnostics.
 * @param warmAllSpecs Warm every definition spec, or one representative execution spec.
 */
export async function prepareTestBrowser(vitest: Vitest, runId?: string, warmAllSpecs = true): Promise<void> {
  const started = performance.now()
  // The separate v4 browser server is lazy. v5 creates and prewarms its shared server during startup.
  const initBrowserServers = (vitest as Vitest & { _initBrowserServers?: () => Promise<void> })._initBrowserServers
  await initBrowserServers?.call(vitest)
  await Promise.all(vitest.projects.map(async (project) => {
    const client = project.browser?.vite.environments.client
    if (!client) return
    // On v5 the shared server defers listening until provider initialization.
    // The client optimizer needs that listener before warming any imports.
    const browserProject = project as typeof project & { _initBrowserProvider: () => Promise<void> }
    if (!initBrowserServers) await browserProject._initBrowserProvider()
    // Neither operation executes user code. Keep both rejections observed;
    // Vitest retains browser ownership if abort or optimizer failure wins.
    await Promise.all([initBrowserServers && (async () => {
      await browserProject._initBrowserProvider()
      await prepareVitestCollectionProvider(project.browser?.provider)
    })(), (async () => {
      const { testFiles } = await project.globTestFiles()
      // Execution specs share the same harness. Warming one reaches its imports
      // without making a large run wait for every generated file to transform.
      const specs = warmAllSpecs ? testFiles : testFiles.slice(0, 1)
      await warmClientModules(client, [...specs, ...project.config.setupFiles].map(file => `/@fs/${file}`), project.browser?.vite.config.root, !initBrowserServers)
      await finishClientOptimization(client)
    })()])
  }))
  debugVitestBrowser('collection:optimizer', { runId, duration: performance.now() - started })
}
