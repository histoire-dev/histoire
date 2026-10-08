import type { InlineConfig, Plugin } from 'vite'
import { VITEST_BROWSER_OPTIMIZER_EXCLUDES } from './dependencies.js'

/** Definition discovery scans remaining entries after Histoire/framework config hooks settle. */
export function createDefinitionOptimizerPolicy(options: NonNullable<InlineConfig['optimizeDeps']>): Plugin {
  return {
    name: 'histoire:definition-optimizer-ownership',
    enforce: 'post',
    /** Vite resolves separate root/client copies; both must override runtime noDiscovery default. */
    configResolved(config) {
      for (const optimizer of [config.optimizeDeps, config.environments.client.optimizeDeps]) {
        Object.assign(optimizer, options)
        optimizer.exclude = [...new Set([...(optimizer.exclude ?? []), ...VITEST_BROWSER_OPTIMIZER_EXCLUDES])]
      }
    },
  }
}
