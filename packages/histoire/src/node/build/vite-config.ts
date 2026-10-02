import type {
  ViteDevServer,
  InlineConfig as ViteInlineConfig,
  Plugin as VitePlugin,
} from 'vite'
import type { Context } from '../context.js'
import { join } from 'pathe'
import { mergeConfig as mergeViteConfig } from 'vite'
import { APP_PATH } from '../alias.js'
import { getViteConfigWithPlugins } from '../vite/index.js'

/**
 * Builds the Vite config of the final bundle: the histoire app entries plus the
 * overrides that must win over anything a user plugin sets (no externals, a
 * single vendor chunk, no code splitting of the CSS…).
 *
 * @param ctx Histoire context holding the resolved user config.
 * @param collectServer The dev server used for story collection: `@vitejs/plugin-vue`
 * is re-pointed at it so template inlining stays disabled during the build.
 */
export async function createBuildViteConfig(ctx: Context, collectServer: ViteDevServer, outputRoot = ctx.config.outDir) {
  const { viteConfig: buildViteConfigRaw } = await getViteConfigWithPlugins(false, ctx)
  const buildViteConfig: ViteInlineConfig = mergeViteConfig(buildViteConfigRaw, {
    mode: 'development',
    build: {
      lib: false,
      rollupOptions: {
        input: [
          join(APP_PATH, 'bundle-main.js'),
          join(APP_PATH, 'bundle-sandbox.js'),
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

      // Force chunk strategy
      config.build.rollupOptions.output = {
        manualChunks(id) {
          if (!id.includes('@histoire/app') && id.includes('node_modules')) {
            for (const test of ctx.config.build?.excludeFromVendorsChunk ?? []) {
              if ((
                typeof test === 'string' && id.includes(test)
              ) || (
                test instanceof RegExp && test.test(id)
              )) {
                // Excluded from vendor chunk
                return
              }
            }
            return 'vendor'
          }
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
