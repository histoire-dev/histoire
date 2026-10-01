import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import { mergeAlias } from 'vite'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { getVitestBrowserProjectConfig } from './browser-project.js'
import { getVitestBrowserDependencyNames, getVitestBrowserOptimizeDeps, VITEST_BROWSER_OPTIMIZER_EXCLUDES } from './dependencies.js'
import { createVitestBrowserResolvePlugin } from './resolve-plugin.js'

export { assignVitestBrowserProjectOptions } from './browser-project.js'
export { createVitestBrowserResolvePlugin } from './resolve-plugin.js'

/** Logs a browser-runtime lifecycle step (see {@link debugVitestBrowser}). */
export const debugVitestBrowserLifecycle = debugVitestBrowser

/**
 * The Vitest + Vite config pair a browser runtime run is created from.
 * Exported so the collection/test config builders can be declared.
 */
export interface VitestBrowserRuntimeConfigResult {
  vitestOptions: {
    plugins: VitePlugin[]
  }
  viteConfig: InlineConfig & {
    test: Record<string, any>
  }
}

export interface CreateVitestBrowserRuntimeConfigOptions {
  isServer?: boolean
  define?: Record<string, string>
  optimizeDeps?: {
    entries?: string[]
    include?: string[]
    noDiscovery?: boolean
    force?: boolean
  }
  test?: Record<string, any>
  resolveAlias?: Record<string, string>
}

/**
 * Assembles the Vite + Vitest config of a Histoire browser run (story
 * collection or test execution) from a base Vite config.
 * @param ctx The histoire context.
 * @param viteConfig The base Vite config to extend.
 * @param options Per-run overrides (defines, optimizer entries, aliases…).
 */
export async function createVitestBrowserRuntimeConfig(
  ctx: Context,
  viteConfig: InlineConfig,
  options: CreateVitestBrowserRuntimeConfigOptions = {},
): Promise<VitestBrowserRuntimeConfigResult> {
  const plugins = [...((viteConfig.plugins as VitePlugin[] | undefined) ?? [])]
  plugins.push(createVitestBrowserResolvePlugin(ctx, options.isServer))
  const defaultTest = await getVitestBrowserProjectConfig(ctx.root, plugins)
  const browserDependencyNames = getVitestBrowserDependencyNames(ctx)

  return {
    vitestOptions: {
      plugins,
    },
    viteConfig: {
      ...(viteConfig as InlineConfig & { test?: Record<string, any> }),
      resolve: {
        ...viteConfig.resolve,
        // Use Vite's own `mergeAlias` instead of an object spread: `resolve.alias`
        // can legally be the array form `[{ find, replacement }]`, and spreading
        // that into `{ ... }` would turn it into `{ '0': entry, '1': entry }`,
        // which Vite reads as aliases with `find: '0'` — silently dropping every
        // user alias in the vitest browser run. `mergeAlias(a, b)` normalizes both
        // forms and gives `b` (our own aliases) precedence, matching the previous
        // last-spread-wins behaviour.
        alias: mergeAlias(viteConfig.resolve?.alias, options.resolveAlias),
      },
      define: {
        ...viteConfig.define,
        ...options.define,
      },
      optimizeDeps: {
        ...viteConfig.optimizeDeps,
        ...options.optimizeDeps,
        include: [
          ...new Set([
            ...getVitestBrowserOptimizeDeps(ctx),
            ...((options.optimizeDeps?.include ?? [])),
          ]),
        ],
        noDiscovery: options.optimizeDeps?.noDiscovery ?? viteConfig.optimizeDeps?.noDiscovery,
        force: options.optimizeDeps?.force ?? viteConfig.optimizeDeps?.force,
      },
      plugins,
      test: {
        ...defaultTest,
        ...options.test,
        deps: {
          optimizer: {
            client: {
              enabled: true,
              include: browserDependencyNames,
              exclude: VITEST_BROWSER_OPTIMIZER_EXCLUDES,
              entries: options.optimizeDeps?.entries ?? viteConfig.optimizeDeps?.entries ?? [],
              force: options.optimizeDeps?.force ?? viteConfig.optimizeDeps?.force,
            },
          },
          ...options.test?.deps,
        },
        browser: {
          ...defaultTest.browser,
          ...options.test?.browser,
        },
      },
    },
  }
}
