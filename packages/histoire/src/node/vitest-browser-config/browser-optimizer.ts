import type { InlineConfig, Plugin } from 'vite'
import { VITEST_BROWSER_OPTIMIZER_EXCLUDES } from './dependencies.js'

/** Scan reachable dependencies after Histoire and framework config hooks settle. */
export function createBrowserOptimizerPolicy(options: NonNullable<InlineConfig['optimizeDeps']>): Plugin {
  return {
    name: 'histoire:browser-optimizer-ownership',
    enforce: 'post',
    /** Vite resolves separate root/client copies; both must override runtime noDiscovery default. */
    configResolved(config) {
      for (const optimizer of [config.optimizeDeps, config.environments.client.optimizeDeps]) {
        // Excludes add up: Vitest's own (`msw/browser`, its client) must stay,
        // or discovering them after the first optimization reloads the testers.
        const exclude = [...(optimizer.exclude ?? []), ...(options.exclude ?? []), ...VITEST_BROWSER_OPTIMIZER_EXCLUDES]
        Object.assign(optimizer, options)
        optimizer.exclude = [...new Set(exclude)]
      }
    },
  }
}
