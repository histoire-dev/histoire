import type { ViteDevServer } from 'vite'
import { APP_PATH } from '../alias.js'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { finishClientOptimization, getStaticClientPreloads, warmClientModules } from '../util/client-optimizer.js'

/** Readiness hints belong to exact Vite server generation, not global source metadata. */
const preloads = new WeakMap<ViteDevServer, string[]>()

/** Browser can fetch static app graph in parallel instead of waiting for nested source imports. */
export function getDevClientPreloads(server: ViteDevServer): readonly string[] {
  return preloads.get(server) ?? []
}

/** Ready source must not reload its first socket while discovering initial workbench dependencies. */
export async function prepareDevClient(server: ViteDevServer): Promise<void> {
  const client = server.environments.client
  const started = performance.now()
  const entry = `/@fs/${APP_PATH}/bundle-main${process.env.HISTOIRE_DEV ? '-dev' : ''}.js`
  const entries = [
    entry,
    ...(process.env.HISTOIRE_DEV ? [`/@fs/${APP_PATH}/app/components/panes/tests/TestsPanel.vue`] : []),
  ]
  const graph = await warmClientModules(client, entries)
  await finishClientOptimization(client)
  preloads.set(server, getStaticClientPreloads(graph, entries))
  debugVitestBrowser('collection:client-ready', { duration: performance.now() - started, modules: client.moduleGraph.idToModuleMap.size })
}
