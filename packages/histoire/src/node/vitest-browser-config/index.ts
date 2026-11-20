import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { getVitestBrowserProjectConfig, getVitestBrowserServerConfig } from './browser-project.js'
import { getVitestBrowserOptimizeDeps } from './dependencies.js'
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
  /** Entry scanning discovers actual browser imports instead of every development tool. */
  reachableDependencies?: boolean
  isServer?: boolean
  define?: Record<string, string>
  optimizeDeps?: {
    entries?: string[]
    include?: string[]
    noDiscovery?: boolean
    force?: boolean
  }
  test?: Record<string, any>
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
  const runViteConfig: InlineConfig = {
    ...viteConfig,
    define: {
      ...viteConfig.define,
      ...options.define,
    },
    optimizeDeps: {
      ...viteConfig.optimizeDeps,
      ...options.optimizeDeps,
      include: [
        ...new Set([
          ...(options.reachableDependencies ? viteConfig.optimizeDeps?.include ?? [] : getVitestBrowserOptimizeDeps(ctx)),
          ...((options.optimizeDeps?.include ?? [])),
        ]),
      ],
      noDiscovery: options.optimizeDeps?.noDiscovery ?? viteConfig.optimizeDeps?.noDiscovery,
      force: options.optimizeDeps?.force ?? viteConfig.optimizeDeps?.force,
    },
    plugins,
  }
  // Applied by the browser server only (see `getVitestBrowserProjectConfig`).
  const browserOptimizer = options.reachableDependencies ? { ...viteConfig.optimizeDeps, ...options.optimizeDeps } : undefined
  const defaultTest = await getVitestBrowserProjectConfig(ctx.root, plugins, browserOptimizer, getVitestBrowserServerConfig(runViteConfig, viteConfig.optimizeDeps))

  return {
    vitestOptions: {
      plugins,
    },
    viteConfig: {
      ...(runViteConfig as InlineConfig & { test?: Record<string, any> }),
      test: {
        ...defaultTest,
        ...options.test,
        deps: {
          optimizer: {
            // Vitest applies this to the `client` environment of its Node-side
            // server, which resolves with Node conditions and never serves the
            // page (the browser server has its own optimizer). Pre-bundling
            // browser dependencies there fails on packages without a Node
            // entry (e.g. `@tiptap/pm`, which has no `.` export).
            client: { enabled: false },
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
