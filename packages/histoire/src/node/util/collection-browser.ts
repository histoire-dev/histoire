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
  // COMPAT: browser server initialization matches existing provider adapter's
  // internal Vitest API. Real browser integration covers supported Vitest 4.1.
  await (vitest as Vitest & { _initBrowserServers: () => Promise<void> })._initBrowserServers()
  await Promise.all(vitest.projects.map(async (project) => {
    const client = project.browser?.vite.environments.client
    if (!client) return
    // Neither operation executes user code. Keep both rejections observed;
    // Vitest retains browser ownership if abort or optimizer failure wins.
    await Promise.all([(async () => {
      await (project as typeof project & { _initBrowserProvider: () => Promise<void> })._initBrowserProvider()
      await prepareVitestCollectionProvider(project.browser?.provider)
    })(), (async () => {
      const { testFiles } = await project.globTestFiles()
      // Execution specs share the same harness. Warming one reaches its imports
      // without making a large run wait for every generated file to transform.
      const specs = warmAllSpecs ? testFiles : testFiles.slice(0, 1)
      await warmClientModules(client, [...specs, ...project.config.setupFiles].map(file => `/@fs/${file}`), project.browser?.vite.config.root)
      await finishClientOptimization(client)
    })()])
  }))
  debugVitestBrowser('collection:optimizer', { runId, duration: performance.now() - started })
}
