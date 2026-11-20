import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { BrowserProviderOption, Vitest } from 'vitest/node'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { importResolvedModule } from '../util/import-resolved.js'
import { getVitestMajor, resolveVitestModule } from '../util/resolve-vitest-package.js'
import { createBrowserOptimizerPolicy } from './browser-optimizer.js'

/** Chromium flags giving test pages a callable collector and live heap figures. */
const TEST_BROWSER_ARGS = ['--js-flags=--expose-gc', '--enable-precise-memory-info']

/**
 * Builds the default `test` options of a browser run: headless chromium through
 * the project's own `@vitest/browser-playwright`, with Histoire's plugins.
 * @param root Project root, used to resolve the provider package.
 * @param plugins Vite plugins the browser server must also apply.
 * @param optimizeDeps Reachable dependency policy, applied to the browser server only.
 * @param serverConfig Other Vite options of the browser server (see {@link getVitestBrowserServerConfig}).
 */
export async function getVitestBrowserProjectConfig(
  root: string,
  plugins: VitePlugin[] = [],
  optimizeDeps?: InlineConfig['optimizeDeps'],
  serverConfig: InlineConfig = {},
) {
  const { playwright } = await importResolvedModule(resolveVitestModule(root, '@vitest/browser-playwright'))
  const provider = playwright({ launchOptions: { args: TEST_BROWSER_ARGS } })
  const sharedServer = getVitestMajor(root) >= 5
  return {
    browser: {
      enabled: true,
      ui: false,
      headless: true,
      // Specs free the documents of finished spec files themselves (see `releaseFinishedSpecs`):
      // Chromium alone keeps them until its heap limit, gigabytes per test tab.
      provider: sharedServer ? provider : wrapBrowserProviderWithPlugins(provider, plugins, optimizeDeps, serverConfig),
      instances: [
        {
          browser: 'chromium' as const,
        },
      ],
    },
    plugins,
  }
}

/**
 * Vite options the browser server needs from a run's Vite config.
 *
 * Vitest creates that server from `project.options` and the project's config
 * file only, never from the inline config of `createVitest`. Histoire's
 * configs are inline (`configFile: false`), so without this copy framework
 * and user options (Nuxt's `#app` aliases, `resolve.dedupe`, `css`,
 * `publicDir`, `server.fs.allow`, …) never reach the page. Vitest overwrites
 * the keys it owns (`root`, `base`, `define`, `cacheDir`, `mode`, …).
 *
 * Left out: `plugins` (passed separately) and `test` (Vitest options).
 * `optimizeDeps` comes from the framework and user config, not from the run's
 * own lists: their `include` pre-bundles CommonJS dependencies the page would
 * fail to import raw. Its `entries` and `noDiscovery` are left out: Histoire's
 * core plugin disables discovery by default, and variant tests apply their
 * optimizer policy on the browser server separately.
 * @param viteConfig The run's Vite config.
 * @param optimizeDeps The framework and user optimizer config.
 */
export function getVitestBrowserServerConfig(viteConfig: InlineConfig, optimizeDeps: InlineConfig['optimizeDeps'] = {}): InlineConfig {
  const { test: _test, plugins: _plugins, optimizeDeps: _runOptimizeDeps, ...serverConfig } = viteConfig as InlineConfig & { test?: unknown }
  const { entries: _entries, noDiscovery: _noDiscovery, ...frameworkOptimizeDeps } = optimizeDeps
  return { ...serverConfig, optimizeDeps: frameworkOptimizeDeps }
}

/**
 * COMPAT: Vitest 4 embeds a separate browser server. This and `assignVitestBrowserProjectOptions` write
 * `@internal` API surfaces (`provider.serverFactory`, `project.options`,
 * `coreWorkspaceProject`) — the only channel through which `@vitest/browser`
 * accepts extra Vite plugins and options for its browser server (it spreads
 * `project.options` into `createViteServer`). Verified through vitest 4.1.10; the
 * `peerDependencies` range in package.json documents the supported versions
 * and must be re-verified before widening it.
 */
function wrapBrowserProviderWithPlugins(
  provider: BrowserProviderOption,
  plugins: VitePlugin[],
  optimizeDeps: InlineConfig['optimizeDeps'] | undefined,
  serverConfig: InlineConfig,
): BrowserProviderOption {
  return {
    ...provider,
    /** Provider acquisition follows server optimization; first document includes native browser launch. */
    providerFactory(project) {
      const instance = provider.providerFactory(project)
      if (optimizeDeps && process.env.HST_DEBUG_BROWSER) {
        const openPage = instance.openPage.bind(instance)
        let first = true
        instance.openPage = async (...arguments_) => {
          const started = performance.now()
          const initial = first
          first = false
          try {
            return await openPage(...arguments_)
          }
          finally { if (initial) debugVitestBrowser('collection:browser-startup', { duration: performance.now() - started }) }
        }
      }
      return instance
    },
    async serverFactory(options: any) {
      const project = options.project as any
      project.options = { ...project.options, ...serverConfig }
      // The optimizer policy belongs to the browser server alone:
      // Vitest's Node-side server shares `plugins` but resolves with Node
      // conditions, where browser-only framework includes fail to resolve.
      project.options.plugins = optimizeDeps ? [...plugins, createBrowserOptimizerPolicy(optimizeDeps)] : plugins
      if (optimizeDeps) project.options.optimizeDeps = optimizeDeps
      return await (provider.serverFactory as (options: unknown) => Promise<unknown>)(options)
    },
  } as BrowserProviderOption
}

/** Launch owned Chromium alongside optimization, without opening a context or tester document. */
export async function prepareVitestCollectionProvider(provider: unknown): Promise<void> {
  // COMPAT: Playwright's private openBrowser uses its existing browserPromise
  // and close waits for that promise. Real browser/cancellation gates cover 4.1.
  const playwright = provider as { name?: string, openBrowser?: (options: { parallel: boolean }) => Promise<unknown> } | undefined
  if (playwright?.name !== 'playwright' || !playwright.openBrowser) return
  const started = performance.now()
  await playwright.openBrowser({ parallel: true })
  debugVitestBrowser('collection:browser-launch', { duration: performance.now() - started })
}

/**
 * Pushes Histoire's Vite plugins onto every project of an already-created
 * Vitest instance (see the COMPAT note above).
 */
export function assignVitestBrowserProjectOptions(vitest: Vitest, options: { plugins: VitePlugin[] }) {
  const projects = Array.isArray((vitest as any).projects) ? [...(vitest as any).projects] : []
  if ((vitest as any).coreWorkspaceProject) {
    projects.push((vitest as any).coreWorkspaceProject)
  }

  for (const project of projects) {
    project.options ??= {}
    project.options.plugins = options.plugins
  }
}
