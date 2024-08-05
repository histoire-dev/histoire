import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import replace from '@rollup/plugin-replace'
import { defu } from 'defu'
import type { Plugin } from 'histoire'
import type { Nuxt } from '@nuxt/schema'
import type { PluginOption, UserConfig as ViteConfig } from 'vite'

const ignorePlugins = [
  'nuxt:vite-node-server',
  'nuxt:dev-style-ssr',
  'nuxt:vite-relative-asset',
  'nuxt:cache-dir',
  'nuxt:dynamic-base-path',
  'nuxt:import-protection',
]

interface IncludeOption {
  include?: (string | RegExp)[] | '*'
  exclude?: undefined
  mock?: Record<string, any>
}

interface ExcludeOption {
  include?: undefined
  exclude?: (string | RegExp)[]
  mock?: Record<string, any>
}

interface NuxtPluginOptions {
  nuxtAppSettings: IncludeOption | ExcludeOption
}

const defaultOptions: NuxtPluginOptions = {
  nuxtAppSettings: { mock: {} },
}

export function HstNuxt(options: NuxtPluginOptions = defaultOptions): Plugin {
  let nuxt: Nuxt
  const _options: NuxtPluginOptions = defu(options, defaultOptions)
  return {
    name: '@histoire/plugin-nuxt',

    async defaultConfig() {
      const nuxtViteConfig = await useNuxtViteConfig(_options)
      const { viteConfig } = nuxtViteConfig

      nuxt = nuxtViteConfig.nuxt // We save it to close it later
      const plugins = viteConfig.plugins.filter((p: any) => !ignorePlugins.includes(p?.name))
      return {
        vite: {
          server: {
            watch: viteConfig.server.watch,
            fs: {
              allow: viteConfig.server.fs.allow,
            },
            middlewareMode: false,
          },
          define: {
            ...viteConfig.define,
            'process.server': false,
            'process.client': true,
            'process.browser': true,
            'process.nitro': false,
            'process.prerender': false,
          },
          resolve: {
            alias: viteConfig.resolve.alias,
            extensions: viteConfig.resolve.extensions,
            dedupe: viteConfig.resolve.dedupe,
          },
          plugins: [
            ...plugins,
            replace({
              values: {
                'import.meta.server': 'false',
                'import.meta.client': 'true',
              },
              preventAssignment: true,
            }) as unknown as PluginOption,
          ],
          css: viteConfig.css,
          publicDir: viteConfig.publicDir,
          optimizeDeps: {
            ...viteConfig.optimizeDeps,
            exclude: [
              ...viteConfig.optimizeDeps.exclude,
              '@histoire/plugin-nuxt',
            ],
          },
          // @ts-expect-error Vue-specific config
          vue: viteConfig.vue,
          logLevel: 'info',
        },
        setupCode: [
          `${nuxt.options.css.map(file => `import '${file}'`).join('\n')}`,
          `import { setupNuxtApp } from '@histoire/plugin-nuxt/dist/runtime/app-setup.js'
export async function setupVue3 () {
  await setupNuxtApp(${JSON.stringify(nuxt.options.runtimeConfig.public)})
}`,
        ],
        viteNodeInlineDeps: [
          /\/(nuxt|nuxt3)\//,
          /^#/,
          /\.nuxt/,
          ...(nuxt.options.build.transpile.filter(
            r => typeof r === 'string' || r instanceof RegExp,
          ) as Array<string | RegExp>),
        ],
        build: {
          excludeFromVendorsChunk: [
            /nuxt\/dist\/app/,
          ],
        },
      }
    },

    onDev(api, onCleanup) {
      onCleanup(async () => {
        nuxt?.close()
      })
    },

    onBuild() {
      nuxt?.close()
    },

    onPreview() {
      nuxt?.close()
    },
  }
}

async function useNuxtViteConfig(options: NuxtPluginOptions) {
  const { loadNuxt, buildNuxt } = await import('@nuxt/kit')
  const nuxt = await loadNuxt({
    // cwd: process.cwd(),
    ready: false,
    dev: true,
    overrides: {
      devtools: { enabled: false },
      ssr: false,
      experimental: {
        appManifest: false,
      },
      app: {
        rootId: 'nuxt-test',
      },
      pages: false,
      typescript: {
        typeCheck: false,
      },
      runtimeConfig: {
        public: {
          histoireNuxtPluginOptions: JSON.stringify(options, stringifyOptionalRegExp),
        },
      },
    },
  })
  if (nuxt.options.builder as string !== '@nuxt/vite-builder') {
    throw new Error(`Histoire only supports Vite bundler, but Nuxt builder is currently set to '${nuxt.options.builder}'.`)
  }
  const runtimeDir = fileURLToPath(new URL('../runtime', import.meta.url))
  nuxt.options.build.templates.push(
    { src: join(runtimeDir, 'composables.mjs'), filename: 'histoire/composables.mjs' },
    { src: join(runtimeDir, 'components.mjs'), filename: 'histoire/components.mjs' },
  )

  nuxt.hook('app:templates', (app) => {
    app.templates = app.templates.filter(template => template.filename !== 'app-component.mjs')
    app.templates.push({ src: join(runtimeDir, 'app-component.mjs'), filename: 'app-component.mjs' })
  })

  nuxt.hook('imports:sources', (presets) => {
    const stubbedComposables = ['useNuxtApp']
    for (const appPreset of presets.filter(p => p.from?.startsWith('#app'))) {
      appPreset.imports = appPreset.imports.filter(i => typeof i !== 'string' || !stubbedComposables.includes(i))
    }
    presets.push({
      from: '#build/histoire/composables.mjs',
      imports: stubbedComposables,
    })
  })

  return {
    viteConfig: await new Promise<ViteConfig>((resolve, reject) => {
      nuxt.hook('modules:done', () => {
        nuxt.hook('components:extend', (components) => {
          for (const name of ['NuxtLink']) {
            Object.assign(components.find(c => c.pascalName === name) || {}, {
              export: name,
              filePath: '#build/histoire/components.mjs',
            })
          }
        })

        nuxt.hook('vite:configResolved', (config, { isClient }) => {
          if (isClient) {
            resolve(config)
          }
        })
      })
      nuxt.ready()
        .then(() => buildNuxt(nuxt))
        .catch((err) => {
          if (!err.toString().includes('_stop_')) {
            reject(err)
          }
        })
    }),
    nuxt,
  }
}

function stringifyOptionalRegExp(_key: unknown, value: unknown) {
  if (value && value instanceof RegExp) {
    return `__REGEXP:${value.toString()}`
  }
  return value
}
