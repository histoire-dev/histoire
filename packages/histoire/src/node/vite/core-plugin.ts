import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import type { BrowserRuntimePaths } from './resolve-paths.js'
import { dirname, join } from 'pathe'
import { APP_PATH } from '../alias.js'
import { getContextRegistry } from '../runtime/registry.js'
import { installUiHttpRouter } from '../server/ui-channel/http.js'
import { notifyStoryChange } from '../stories.js'
import { resolveHistoireAppBundledDir } from '../util/resolve-histoire-app.js'
import { createEmbedMiddleware } from '../virtual/embed/middleware.js'
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
            'flexsearch',
            'shiki',
            'vscode-oniguruma',
            'vscode-textmate',
          ])

      return {
        resolve: {
          dedupe: [
            'vue',
          ],
          alias: [
            {
              find: 'histoire-style',
              replacement: join(APP_PATH, process.env.HISTOIRE_DEV ? 'app/style/main.pcss' : 'style.css'),
            },
            {
              find: 'histoire-bundled-style',
              // The preview uses bundled components even when the host app runs from source.
              replacement: join(resolveHistoireAppBundledDir(), 'app.css'),
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
            ignored: [`!**/node_modules/.histoire/**`, '**/vite.config.*'],
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

    options() {
      (this.meta as any).histoire = {
        isCollecting: isServer,
      }
    },

    handleHotUpdate(updateContext) {
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
