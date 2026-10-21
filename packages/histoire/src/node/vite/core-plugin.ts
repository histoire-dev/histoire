import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import type { BrowserRuntimePaths } from './resolve-paths.js'
import { dirname, join } from 'pathe'
import { APP_PATH, getHistoireStyleFiles } from '../alias.js'
import { tailwindRuntimeDirectory } from '../builtin-plugins/tailwind/template.js'
import { getContextRegistry } from '../runtime/registry.js'
import { installUiHttpRouter } from '../server/ui-channel/http.js'
import { notifyStoryChange } from '../stories.js'
import { resolveHistoireAppBundledDir } from '../util/resolve-histoire-app.js'
import { createOptimizerCacheIgnore } from '../util/story-ignore.js'
import { createEmbedMiddleware } from '../virtual/embed/middleware.js'
import { resolveVisualConfig } from '../visual/config.js'
import { retireVisualSource } from '../visual/source.js'
import { createAppHtmlMiddleware, createSandboxHtmlMiddleware } from './dev-html.js'
import { createMcpPreviewHtmlMiddleware } from './mcp-preview-html.js'
import { histoireSharedPath, resolveSupportPluginAllowPaths, tryResolveDependency, withPackageDirs } from './resolve-paths.js'

export interface HistoireVitePluginOptions {
  /** Whether the config is built for the node-side (collecting) server. */
  isServer: boolean
  /** Whether the config drives a Vitest browser runtime instead of the app. */
  browserRuntime?: boolean
  /** Project module paths the browser runtime needs. */
  browserRuntimePaths: BrowserRuntimePaths
}

/**
 * Builds the main Histoire Vite plugin: base aliases, dep optimizer setup, dev
 * server file permissions, story hot updates and the dev HTML documents.
 * @param ctx The histoire context.
 * @param options Plugin options (see {@link HistoireVitePluginOptions}).
 */
export function createHistoireVitePlugin(ctx: Context, options: HistoireVitePluginOptions): VitePlugin {
  const { isServer, browserRuntime, browserRuntimePaths } = options
  const supportPluginAllowPaths = resolveSupportPluginAllowPaths(ctx)
  const controlsEntry = tryResolveDependency(ctx.root, '@histoire/controls/package.json')
  // Peer CSS retains font URLs after package publishing, so Vite must serve its assets.
  const controlsAllowPaths = controlsEntry ? [dirname(controlsEntry)] : []
  const { tempDir } = getContextRegistry(ctx)
  const visual = resolveVisualConfig(ctx.config.visual)

  return {
    name: 'histoire-vite-plugin',

    config(_, { command }) {
      const optimizeEntries = browserRuntime
        ? []
        : [
            `${APP_PATH}/bundle-main.js`,
            `${APP_PATH}/bundle-sandbox.js`,
          ]
      const optimizeInclude = browserRuntime
        ? []
        : withPackageDirs([
            'shiki',
          ])

      return {
        resolve: {
          dedupe: [
            'vue',
          ],
          alias: [
            {
              find: 'histoire-style',
              replacement: getHistoireStyleFiles().style,
            },
            {
              find: 'histoire-bundled-style',
              replacement: getHistoireStyleFiles().bundledStyle,
            },
            {
              find: /^@histoire\/shared$/,
              replacement: histoireSharedPath,
            },
            ...(browserRuntimePaths.mswBrowser
              ? [{
                  find: /^msw\/browser$/,
                  replacement: browserRuntimePaths.mswBrowser,
                }]
              : []),
            ...(browserRuntimePaths.mswCoreHttp
              ? [{
                  find: /^msw\/core\/http$/,
                  replacement: browserRuntimePaths.mswCoreHttp,
                }]
              : []),
          ],
          ...(isServer
            ? {
              // Force resolving deps like Node.JS resolution algorithm (in case some modules are not loaded with ssr: true e.g. .vue files)
                conditions: ['node'],
              }
            : {}),
        },
        optimizeDeps: {
          entries: optimizeEntries,
          include: optimizeInclude,
          noDiscovery: browserRuntime,
          exclude: [
            'histoire',
            '@histoire/vendors',
            ...browserRuntime
              ? ['vitest']
              : [],
          ],
        },
        server: {
          fs: {
            allow: [
              APP_PATH,
              tailwindRuntimeDirectory,
              resolveHistoireAppBundledDir(),
              tempDir,
              ctx.resolvedViteConfig.root,
              ctx.root,
              ...supportPluginAllowPaths,
              ...controlsAllowPaths,
              ...browserRuntimePaths.allowPaths,
              ...browserRuntimePaths.mswAllowPaths,
              ...process.env.HISTOIRE_DEV
                ? [
                    '../../packages/histoire-vendors',
                  ]
                : [],
            ],
          },
          watch: {
            // Every run owns its optimizer cache, but older caches can remain
            // beside it. Watch plugin sources while pruning all cache folders.
            ignored: [`!**/node_modules/.histoire/**`, '**/vite.config.*', createOptimizerCacheIgnore(ctx),
              // Offline reports must never reload the reviewing browser. Baseline
              // approvals and saved cells refresh through their owned UI channel.
              `${ctx.root}/.histoire/visual/**`, ...visual ? [`${ctx.root}/${visual.baselineDir}/**`] : []],
          },
          hmr: command === 'build' ? false : !isServer,
        },
        define: {
          // We need to force this to be able to use `devtoolsRawSetupState`
          '__VUE_PROD_DEVTOOLS__': 'true',
          // Disable warnings
          'process.env.NODE_ENV': JSON.stringify(isServer ? 'production' : process.env.NODE_ENV ?? 'development'),
          ...!isServer
            ? {
              // Collect flag
                'process.env.HST_COLLECT': 'false',
              }
            : {},
          '__HST_COLLECT__': isServer,
        },
        cacheDir: join(tempDir, 'vite', browserRuntime
          ? (isServer ? 'browser-server' : 'browser-client')
          : (isServer ? 'server' : 'client')),
      }
    },

    /**
     * Vitest runs once and creates its servers with `server.watch: null`, but
     * the dev watch options returned above re-enable chokidar. A run cancelled
     * while warmup transforms are in flight then re-adds files to the closed
     * watcher (chokidar reopens on `add`), and those live `fs.watch` handles
     * keep the isolated test worker from exiting after teardown.
     * @param config The resolved Vite config, mutated before servers read it.
     */
    configResolved(config) {
      if (browserRuntime) (config.server as { watch: unknown }).watch = null
    },

    options() {
      (this.meta as any).histoire = {
        isCollecting: isServer,
      }
    },

    handleHotUpdate(updateContext) {
      if (visual && !isServer && !browserRuntime) retireVisualSource(updateContext.server)
      const story = ctx.storyFiles.find(file => file.path === updateContext.file)
      if (story) {
        notifyStoryChange(ctx, story)
      }
    },

    configureServer(server) {
      // Catalog belongs to filesystem/explicit collection owners. Browser
      // mounts and reconnects only read it; recollecting here retires ready
      // runtimes on every visit and amplifies optimizer reloads into full scans.
      server.middlewares.use(createEmbedMiddleware(server, ctx))
      server.middlewares.use(createMcpPreviewHtmlMiddleware(server))
      if (!isServer && !browserRuntime) installUiHttpRouter(server)
      server.middlewares.use(createSandboxHtmlMiddleware(server))

      // serve our index.html after vite history fallback
      return () => {
        server.middlewares.use(createAppHtmlMiddleware(server, ctx))
      }
    },
  }
}
