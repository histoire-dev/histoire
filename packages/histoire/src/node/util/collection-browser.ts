import type { Vitest } from 'vitest/node'
import { prepareVitestCollectionProvider } from '../vitest-browser-config/browser-project.js'
import { debugVitestBrowser } from './browser-debug.js'
import { finishClientOptimization, warmClientModules } from './client-optimizer.js'

/** Finish entry scanning and initial prebundling before isolated tester documents open. */
export async function prepareCollectionBrowser(vitest: Vitest): Promise<void> {
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
      const entries = project.browser?.vite.config.optimizeDeps.entries ?? []
      await warmClientModules(client, [...new Set([...testFiles, ...project.config.setupFiles, ...typeof entries === 'string' ? [entries] : entries])].map(file => `/@fs/${file}`))
      await finishClientOptimization(client)
    })()])
  }))
  debugVitestBrowser('collection:optimizer', { duration: performance.now() - started })
}
