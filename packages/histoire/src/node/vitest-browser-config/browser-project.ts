import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { BrowserProviderOption, Vitest } from 'vitest/node'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { importResolvedModule } from '../util/import-resolved.js'
import { resolveVitestModule } from '../util/resolve-vitest-package.js'

/**
 * Builds the default `test` options of a browser run: headless chromium through
 * the project's own `@vitest/browser-playwright`, with Histoire's plugins.
 * @param root Project root, used to resolve the provider package.
 * @param plugins Vite plugins the browser server must also apply.
 */
export async function getVitestBrowserProjectConfig(root: string, plugins: VitePlugin[] = [], optimizeDeps?: InlineConfig['optimizeDeps']) {
  const { playwright } = await importResolvedModule(resolveVitestModule(root, '@vitest/browser-playwright'))
  return {
    browser: {
      enabled: true,
      ui: false,
      headless: true,
      provider: wrapBrowserProviderWithPlugins(playwright(), plugins, optimizeDeps),
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
 * COMPAT: this and `assignVitestBrowserProjectOptions` write Vitest
 * `@internal` API surfaces (`provider.serverFactory`, `project.options`,
 * `coreWorkspaceProject`) — the only channel through which `@vitest/browser`
 * accepts extra Vite plugins for its browser server (it reads
 * `project.options?.plugins`). Verified through vitest 4.1.10; the
 * `peerDependencies` range in package.json documents the supported versions
 * and must be re-verified before widening it.
 */
function wrapBrowserProviderWithPlugins(
  provider: BrowserProviderOption,
  plugins: VitePlugin[],
  optimizeDeps?: InlineConfig['optimizeDeps'],
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
      project.options ??= {}
      project.options.plugins = plugins
      if (optimizeDeps) project.options.optimizeDeps = optimizeDeps
      return await provider.serverFactory(options)
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
