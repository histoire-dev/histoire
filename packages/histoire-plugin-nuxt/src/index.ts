import type { Nuxt } from '@nuxt/schema'
import type { Plugin } from 'histoire'
import type { UserConfig as ViteConfig } from 'vite'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import replace from '@rollup/plugin-replace'

const ignorePlugins = [
  'nuxt:vite-node-server',
  'nuxt:dev-style-ssr',
  'nuxt:vite-relative-asset',
  'nuxt:cache-dir',
  'nuxt:dynamic-base-path',
  'nuxt:import-protection',
]

export function HstNuxt(): Plugin {
  let nuxt: Nuxt
  return {
    name: '@histoire/plugin-nuxt',

    async defaultConfig() {
      const nuxtViteConfig = await useNuxtViteConfig()
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
            }),
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

async function useNuxtViteConfig() {
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
    const polyfills = ['requestIdleCallback', 'cancelIdleCallback']
    const stubbedComposables = ['useNuxtApp']
    for (const appPreset of presets.filter(p => p.from?.startsWith('#app'))) {
      appPreset.imports = appPreset.imports.filter(i => typeof i !== 'string' || (!stubbedComposables.includes(i) && !polyfills.includes(i)))
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
            resolve(config as any)
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
