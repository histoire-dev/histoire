import type { Plugin as VitePlugin } from 'vite'
import type { Context } from '../context.js'
import { createRequire } from 'node:module'
import { relative } from 'pathe'

const require = createRequire(import.meta.url)

/**
 * Packages the local Histoire development setup redirects to the prebuilt
 * `@histoire/vendors` bundles, so the examples share one copy of each.
 */
const DEV_VENDOR_ALIASES: Array<[name: string, entry: string]> = [
  ['floating-vue', 'floating-vue'],
  ['@iconify/vue', 'iconify'],
  ['pinia', 'pinia'],
  ['scroll-into-view-if-needed', 'scroll'],
  ['vue-router', 'vue-router'],
  ['@vueuse/core', 'vue-use'],
  ['vue', 'vue'],
]

/**
 * Replaces the `__HISTOIRE_DEV__` compile-time flags in app and story sources.
 * @param ctx The histoire context.
 */
export function createFlagsPlugin(ctx: Context): VitePlugin {
  const flags = {
    '_ctx.__HISTOIRE_DEV__': JSON.stringify(ctx.mode === 'dev'),
    '__HISTOIRE_DEV__': JSON.stringify(ctx.mode === 'dev'),
  }

  return {
    name: 'histoire:flags',
    enforce: 'pre',
    transform(code, id) {
      // Source-development workbench helpers are TypeScript; bundled consumers
      // still enter through JavaScript. Both must share the same static gate.
      if (id.match(/\.(vue|[cm]?[jt]sx?)($|\?)/)) {
        const original = code
        for (const flag in flags) {
          code = code.replace(new RegExp(flag, 'g'), flags[flag])
        }
        if (original !== code) return code
      }
    },
  }
}

/**
 * Runs the server-side action of a command triggered from the app.
 * @param ctx The histoire context.
 */
export function createDevCommandsPlugin(ctx: Context): VitePlugin {
  return {
    name: 'histoire:dev-commands',
    configureServer(server) {
      server.ws.on('histoire:dev-command', ({ id, params }) => {
        const command = ctx.registeredCommands.find(c => c.id === id)
        if (command?.serverAction) {
          command.serverAction(params)
        }
      })
    },
  }
}

/**
 * Injects the source file name into built components so the app shows their
 * real name instead of `<Anonymous>`.
 * @param ctx The histoire context.
 */
export function createFileNamePlugin(ctx: Context): VitePlugin {
  const include = [/\.vue$/]
  const exclude = [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/]

  return {
    name: 'histoire-file-name-plugin',
    enforce: 'post',

    transform(code, id) {
      if (exclude.some(r => r.test(id))) return
      if (include.some(r => r.test(id))) {
        const file = relative(ctx.resolvedViteConfig.root, id)
        const index = code.indexOf('export default')
        const result = `${code.substring(0, index)}_sfc_main.__file = '${file}'\n${code.substring(index)}`
        return result
      }
    },
  }
}

/** Absolute path of the floating-vue stylesheet installed for `@histoire/vendors`. */
function resolveVendoredFloatingVueStyle(): string {
  return createRequire(require.resolve('@histoire/vendors/package.json')).resolve('floating-vue/dist/style.css')
}

/**
 * Aliases the app dependencies to `@histoire/vendors` when running Histoire
 * itself from source (the examples context).
 */
export function createHistoireDevPlugin(): VitePlugin {
  return {
    name: 'histoire-dev-plugin',
    config() {
      // Examples context
      return {
        optimizeDeps: {
          // Native panels must share vendor Vue with the source app. Optimizing
          // the scroller separately can bundle a second renderer into its slots.
          exclude: ['vue-virtual-scroller'],
        },
        resolve: {
          alias: [
            // Exports targets may not contain `node_modules` (Vite 8 enforces it),
            // so point the vendored stylesheet at its file instead of a subpath.
            { find: /^floating-vue\/dist\/style\.css$/, replacement: resolveVendoredFloatingVueStyle() },
            ...DEV_VENDOR_ALIASES.reduce((acc, [name, entry]) => {
              acc.push({
                find: new RegExp(`^${name.replace(/\//g, '\\/')}$`),
                replacement: `@histoire/vendors/${entry}`,
              })
              acc.push({
                find: new RegExp(`^${name.replace(/\//g, '\\/')}\\/`),
                replacement: `@histoire/vendors/${entry}/`,
              })
              return acc
            }, [] as any[]),

            { find: /@histoire\/controls$/, replacement: '@histoire/controls/src/index.ts' },
          ],
        },
      }
    },
  }
}
