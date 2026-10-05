import type { Plugin, UserConfig } from 'vite'

/** Direct replacement avoids Vite merging framework include arrays back into collection. */
function disableCollectionOptimizer(config: Pick<UserConfig, 'optimizeDeps' | 'environments'>) {
  config.optimizeDeps = { ...config.optimizeDeps, noDiscovery: true, include: [] }
  const client = config.environments?.client
  if (client) client.optimizeDeps = { ...client.optimizeDeps, noDiscovery: true, include: [] }
}

/** Collection runs one raw framework runtime; browser sources retain caller optimizer policy. */
export function createCollectionOptimizerPolicy(collecting: boolean): Plugin | undefined {
  if (!collecting) return undefined
  return {
    name: 'histoire:collection-optimizer-ownership',
    enforce: 'post',
    /** Framework config hooks run first; an empty returned array would concatenate. */
    config(config) {
      disableCollectionOptimizer(config)
    },
    /** Middleware startup initializes optimizers before createServer returns. */
    configResolved(config) {
      disableCollectionOptimizer(config)
    },
  }
}
