import type {
  ViteDevServer,
  InlineConfig as ViteInlineConfig,
  Plugin as VitePlugin,
} from 'vite'
import type { Context } from '../context.js'
import { join } from 'pathe'
import { mergeConfig as mergeViteConfig, version as viteVersion } from 'vite'
import { APP_PATH } from '../alias.js'
import { resolveEmbedConfig } from '../config/embed.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { isLazyBrowserDependency } from './lazy-dependencies.js'
import { hasVendorDependencyClosure } from './vendor-graph.js'

/**
 * Builds the Vite config of the final bundle: the histoire app entries plus the
 * overrides that must win over anything a user plugin sets (no externals, a
 * dependency-closed vendor chunk, no code splitting of the CSS…).
 *
 * @param ctx Histoire context holding the resolved user config.
 * @param collectServer The dev server used for story collection: `@vitejs/plugin-vue`
 * is re-pointed at it so template inlining stays disabled during the build.
 */
export async function createBuildViteConfig(ctx: Context, collectServer: ViteDevServer, outputRoot = ctx.config.outDir) {
  const { viteConfig: buildViteConfigRaw } = await getViteConfigWithPlugins(false, ctx)
  const embedEnabled = resolveEmbedConfig(ctx.config.embed).enabled
  const buildViteConfig: ViteInlineConfig = mergeViteConfig(buildViteConfigRaw, {
    mode: 'development',
    build: {
      lib: false,
      rollupOptions: {
        preserveEntrySignatures: 'strict',
        input: [
          join(APP_PATH, 'bundle-main.js'),
          join(APP_PATH, 'bundle-sandbox.js'),
          ...embedEnabled ? [join(APP_PATH, 'bundle-embed.js')] : [],
        ],
        plugins: [
          {
            name: 'histoire-build-rollup-options-override',
            enforce: 'post',
            options(options) {
              // Don't externalize
              options.external = []
            },
          },
        ],
      },
    },
  })

  // For @vite/plugin-vue: Always put our vite server
  // Disable template inlining
  // (so that we no longer need defineExpose)
  // Nuxt: replaces the Nuxt vite dev server
  buildViteConfig.plugins.push({
    name: 'histoire-vue-plugin-override',
    config(config) {
      const vuePlugin = config.plugins.find((p: any) => p.name === 'vite:vue') as VitePlugin
      if (vuePlugin) {
        // @ts-expect-error vue plugin use function form
        const original = vuePlugin.configureServer.bind(vuePlugin)
        vuePlugin.configureServer = () => {
          original({
            ...collectServer,
            config: {
              ...collectServer.config,
              server: {
                ...collectServer.config.server,
                hmr: false,
              },
            },
          })
        }
        // @ts-expect-error vue plugin use function form
        vuePlugin.configureServer(collectServer)
      }
    },
  })

  buildViteConfig.plugins.push({
    name: 'histoire-build-config-override',
    enforce: 'post',
    config(config) {
      // Don't externalize
      config.build.rollupOptions.external = []

      /** Portable data stays outside UI/vendor even for installed SDK packages. */
      const isEmbedData = (id: string) => embedEnabled && (id.includes('@histoire/protocol') || id.includes('/histoire-protocol/') || id.includes('/fuse.js/'))
      /** Optional engines and project-dependent packages retain natural boundaries. */
      const isVendorCandidate = (id: string) => !isLazyBrowserDependency(id) && !isEmbedData(id)
        && !id.includes('@histoire/app') && id.includes('node_modules')
        && !(ctx.config.build?.excludeFromVendorsChunk ?? []).some(test => typeof test === 'string' ? id.includes(test) : test.test(id))
      // Force only dependency-closed packages into vendor. Generated Nuxt UI
      // themes can import story code, so grouping them with Vue creates a cycle.
      config.build.rollupOptions.output = {
        // Shared vendor imports must not absorb Vite's preload helper used by
        // data entry's lazy surface imports and thereby force Vue to execute.
        ...(Number.parseInt(viteVersion, 10) < 8 ? { onlyExplicitManualChunks: true } : {}),
        manualChunks(id, graph) {
          // MSW storage effects and heavy content engines belong to explicit
          // runtime/panel imports, never the shared Vue/vendor entry. Let
          // Rollup preserve their actual dynamic dependency boundaries.
          if (isLazyBrowserDependency(id)) return
          // Data entry must not inherit Vue/router/runtime side effects from
          // standalone's shared vendor chunk, even when both entries are built.
          if (isEmbedData(id)) return 'embed-data'
          if (hasVendorDependencyClosure(id, moduleId => graph.getModuleInfo(moduleId), isVendorCandidate)) return 'vendor'
        },
      }

      // Force vite build options
      Object.assign(config.build, {
        outDir: outputRoot,
        emptyOutDir: true,
        cssCodeSplit: false,
        minify: false,
        // Don't build in SSR mode
        ssr: false,
      })

      config.define.__HST_COLLECT__ = false
    },
  })

  return buildViteConfig
}
