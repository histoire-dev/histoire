import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import type { VitestBrowserRuntimeConfigResult } from './index.js'
import { resolve } from 'pathe'
import { RESOLVED_TEST_HARNESS_ID, TEST_HARNESS_ID } from '../virtual/index.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { createVitestBrowserRuntimeConfig } from './index.js'

export interface HistoireBrowserRunConfigOptions {
  /**
   * True for a story collection run, false for a test run. The two differ only
   * in the module the specs import, the optimizer strategy and the
   * `HST_COLLECT` flag baked into the bundle.
   */
  collecting: boolean
  /** The generated specs, used as dependency optimizer entries. */
  entries: string[]
  /** Extra Vite plugins (the collection results channel). */
  plugins?: VitePlugin[]
}

/**
 * Builds the Vite + Vitest config of a Histoire browser run.
 * @param ctx The histoire context.
 * @param options Run configuration (see {@link HistoireBrowserRunConfigOptions}).
 */
export async function getHistoireBrowserRunConfig(
  ctx: Context,
  options: HistoireBrowserRunConfigOptions,
): Promise<VitestBrowserRuntimeConfigResult> {
  const { collecting, entries } = options
  const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
    browserRuntime: true,
    collecting,
  })

  if (options.plugins?.length) {
    viteConfig.plugins = [...((viteConfig.plugins as VitePlugin[] | undefined) ?? []), ...options.plugins]
  }

  if (collecting) {
    // The collection specs are the only entries: nothing else is imported, so
    // discovery would only slow the run down.
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      include: [],
      entries,
      noDiscovery: true,
    }
  }

  // A dedicated persistent cache dir per kind of run: the default
  // (node_modules/.vite) is shared with the app dev server, and two configs
  // sharing one dir keep invalidating each other. It also stays outside the
  // run's own temp directory (emptied on every run) so it is actually
  // reusable; Vite re-optimizes on config/lockfile changes, so no `force` is
  // needed.
  viteConfig.cacheDir = resolve(ctx.root, '.histoire', 'cache', collecting ? 'vitest-collect' : 'vitest-test')

  return createVitestBrowserRuntimeConfig(ctx, viteConfig, {
    define: {
      'process.env.HST_COLLECT': String(collecting),
      '__HST_COLLECT__': String(collecting),
    },
    optimizeDeps: {
      entries,
    },
    ...(collecting
      ? {
          test: {
            // One story file at a time: collecting executes story modules with
            // side effects (mocks, global setup) in a shared page.
            fileParallelism: false,
            maxWorkers: 1,
            minWorkers: 1,
          },
        }
      : {
          resolveAlias: {
            [TEST_HARNESS_ID]: RESOLVED_TEST_HARNESS_ID,
          },
        }),
  })
}
