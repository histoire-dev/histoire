import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import {
  loadConfigFromFile as loadViteConfigFromFile,
  mergeConfig as mergeViteConfig,
} from 'vite'
import { createMarkdownPlugins } from '../markdown.js'
import { hasProjectVitest } from '../util/has-vitest.js'
import { createVirtualFilesPlugin } from '../virtual/vite-plugin.js'
import { createHistoireVitePlugin } from './core-plugin.js'
import {
  createDevCommandsPlugin,
  createFileNamePlugin,
  createFlagsPlugin,
  createHistoireDevPlugin,
} from './extra-plugins.js'
import { mergeHistoireViteConfig } from './merge-config.js'
import { createMockerPlugins } from './mocker.js'
import { resolveBrowserRuntimePaths } from './resolve-paths.js'
import { createStoryVitestShimPlugin } from './story-vitest-shim.js'
import { createBrowserCollectVitestStubPlugin, createNodeCollectVitestStubPlugin } from './vitest-collect-stub.js'

export interface ViteConfigWithPlugins {
  viteConfig: InlineConfig
  viteConfigFile: string | null
}

export interface GetViteConfigWithPluginsOptions {
  /** Builds the config for a Vitest browser runtime instead of the app. */
  browserRuntime?: boolean
  /** Builds the config for a story collection run. */
  collecting?: boolean
}

/**
 * Builds the full Vite config Histoire runs on, for every mode: app dev server,
 * production build, node-side collection and Vitest browser runtimes.
 * @param isServer Whether the config drives the node-side (collecting) server.
 * @param ctx The histoire context.
 * @param options Config options (see {@link GetViteConfigWithPluginsOptions}).
 */
export async function getViteConfigWithPlugins(
  isServer: boolean,
  ctx: Context,
  options: GetViteConfigWithPluginsOptions = {},
): Promise<ViteConfigWithPlugins> {
  const userViteConfigFile = await loadViteConfigFromFile({ command: ctx.mode === 'dev' ? 'serve' : 'build', mode: ctx.mode })
  const userViteConfig = mergeViteConfig(userViteConfigFile?.config ?? {}, { server: { port: 6006 } })

  const inlineConfig = await mergeHistoireViteConfig(userViteConfig, ctx)
  const plugins: VitePlugin[] = []
  const projectHasVitest = hasProjectVitest(ctx.root)
  const browserRuntimePaths = resolveBrowserRuntimePaths(ctx, projectHasVitest)

  plugins.push(createHistoireVitePlugin(ctx, {
    isServer,
    browserRuntime: options.browserRuntime,
    browserRuntimePaths,
  }))

  plugins.push(createVirtualFilesPlugin(ctx, isServer))

  if (!isServer && options.browserRuntime && options.collecting) {
    plugins.push(createBrowserCollectVitestStubPlugin())
  }

  if (!isServer
    && !options.collecting
    && projectHasVitest
    && browserRuntimePaths.vitestExpect
    && browserRuntimePaths.vitestMockerBrowser
    && browserRuntimePaths.vitestSpy) {
    plugins.push(createStoryVitestShimPlugin(ctx, browserRuntimePaths))
  }

  if (isServer && !options.browserRuntime) {
    plugins.push(createNodeCollectVitestStubPlugin())
  }

  // Skip mocker plugin in browserRuntime mode (collection + test phases).
  // The mocker rewrites dynamic imports to use __vitest_mocker__.wrapDynamicImport()
  // but __vitest_mocker__ isn't initialized by vitest in histoire's browser context.
  // Histoire's own test-harness already wraps dynamic imports safely via
  // runWithVitestDynamicImport().
  if (!isServer && projectHasVitest && !options.browserRuntime) {
    plugins.push(...await createMockerPlugins(ctx))
  }

  // Replace dev flag
  plugins.push(createFlagsPlugin(ctx))

  if (ctx.mode === 'dev') {
    // Dev commands
    plugins.push(createDevCommandsPlugin(ctx))
  }

  // Markdown
  plugins.push(...await createMarkdownPlugins(ctx))

  if (ctx.mode === 'build') {
    // Add file name in build mode to have components names instead of <Anonymous>
    plugins.push(createFileNamePlugin(ctx))
  }

  if (process.env.HISTOIRE_DEV && !isServer) {
    plugins.push(createHistoireDevPlugin())
  }

  for (const plugin of ctx.config.plugins) {
    if (plugin.vitePlugins) {
      await plugin.vitePlugins(plugins)
    }
  }

  const viteConfig = mergeViteConfig(inlineConfig, {
    configFile: false,
    plugins,
  }) as InlineConfig

  return {
    viteConfig,
    viteConfigFile: userViteConfigFile?.path ?? null,
  }
}
