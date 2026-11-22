import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { tryResolveDependency } from '../util/resolve-package.js'
import { getVitestMajor } from '../util/resolve-vitest-package.js'
import { getVitestBrowserProjectConfig, getVitestBrowserServerConfig } from './browser-project.js'
import { getVitestBrowserOptimizeDeps, getVitestFrameworkDependencyNames } from './dependencies.js'
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
  /** Options injected only into Vitest 4's separate browser server. */
  browserProjectOptions?: { plugins: VitePlugin[] }
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
  const sharedServer = getVitestMajor(ctx.root) >= 5
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
  if (sharedServer) {
    // Vitest 5 serves its browser environment from the project Vite server.
    // Set client-specific entries/includes there and keep Vitest's own optimizer active.
    const client = viteConfig.environments?.client
    const framework = getVitestFrameworkDependencyNames(ctx).filter(id => tryResolveDependency(ctx.root, id, { fallback: false }))
    // The shared runtime is linked source in the workspace and an optimizable
    // dependency in published packages. Include it before generated specs load.
    const include = [...new Set(['@histoire/shared', ...framework, ...runViteConfig.optimizeDeps?.include ?? [], ...client?.optimizeDeps?.include ?? []])]
    runViteConfig.optimizeDeps = { ...runViteConfig.optimizeDeps, include }
    runViteConfig.environments = {
      ...viteConfig.environments,
      client: {
        ...client,
        optimizeDeps: {
          ...client?.optimizeDeps,
          ...browserOptimizer,
          ...options.optimizeDeps,
          include,
        },
      },
    }
  }

  // Only the v4 Node-side server needs its unused client optimizer disabled.
  const legacyTestDeps = sharedServer ? {} : { optimizer: { client: { enabled: false } } }
  // v5 defaults to the same port in each worker process, so late browser
  // reconnects can reach a different run and register an unknown-session error.
  const sharedServerOptions = sharedServer ? { api: { port: 0 }, clearMocks: false } : {}

  return {
    vitestOptions: {
      plugins,
    },
    browserProjectOptions: sharedServer ? undefined : { plugins },
    viteConfig: {
      ...(runViteConfig as InlineConfig & { test?: Record<string, any> }),
      test: {
        ...defaultTest,
        ...sharedServerOptions,
        ...options.test,
        deps: {
          ...legacyTestDeps,
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
