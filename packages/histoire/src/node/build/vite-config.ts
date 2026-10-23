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
import { createBuildChunkOutput } from './chunks.js'
import { routeImportsThroughDynamicFacades } from './mock-facades.js'

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
  const bundlerKey = Number.parseInt(viteVersion, 10) >= 8 ? 'rolldownOptions' : 'rollupOptions'
  // Rolldown's non-recursive chunk groups need extendable entries. Existing
  // exports remain public while shared chunks may expose additional bindings.
  const preserveEntrySignatures = bundlerKey === 'rolldownOptions' ? 'allow-extension' : 'strict'
  const input = [
    join(APP_PATH, 'bundle-main.js'),
    join(APP_PATH, 'bundle-sandbox.js'),
    ...embedEnabled ? [join(APP_PATH, 'bundle-embed.js')] : [],
  ]
  // Vite 8 favors native options over the legacy alias. Merge both before adding
  // owned settings so legacy user plugins/policies do not silently disappear.
  if (bundlerKey === 'rolldownOptions' && buildViteConfigRaw.build?.rollupOptions) {
    buildViteConfigRaw.build.rolldownOptions = mergeViteConfig(buildViteConfigRaw.build.rollupOptions, buildViteConfigRaw.build.rolldownOptions ?? {})
    delete buildViteConfigRaw.build.rollupOptions
  }
  const buildViteConfig: ViteInlineConfig = mergeViteConfig(buildViteConfigRaw, {
    mode: 'development',
    build: {
      lib: false,
      [bundlerKey]: {
        preserveEntrySignatures,
        input,
        plugins: [
          {
            name: 'histoire-build-bundler-options-override',
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
      const bundler = config.build[bundlerKey] ??= {}
      // Final assignment also removes project library entries concatenated by mergeConfig.
      bundler.input = input
      bundler.external = []
      bundler.preserveEntrySignatures = preserveEntrySignatures
      bundler.output = createBuildChunkOutput(ctx)

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

  if (bundlerKey === 'rolldownOptions') {
    buildViteConfig.plugins.push({
      name: 'histoire-build-dynamic-facades',
      enforce: 'post',
      generateBundle(_options, bundle) {
        // Keeps Vitest mocks on dynamically imported story dependencies effective.
        routeImportsThroughDynamicFacades(bundle as never)
      },
    })
  }

  return buildViteConfig
}
