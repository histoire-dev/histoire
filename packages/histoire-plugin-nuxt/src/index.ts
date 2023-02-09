import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Plugin } from 'histoire'
import type { Nuxt } from '@nuxt/schema'
import type { UserConfig as ViteConfig } from 'vite'

const ignorePlugins = [
  'nuxt:vite-node-server',
  'nuxt:dev-style-ssr',
  'nuxt:vite-relative-asset',
  'nuxt:cache-dir',
  'nuxt:dynamic-base-path',
  'nuxt:import-protection',
]

export function HstNuxt (): Plugin {
  let nuxt: Nuxt
  return {
    name: '@histoire/plugin-nuxt',

    async defaultConfig () {
      const nuxtConfig = await useNuxtViteConfig()
      nuxt = nuxtConfig.nuxt
      const plugins = nuxtConfig.viteConfig.plugins.filter((p: any) => !ignorePlugins.includes(p?.name))
      return {
        vite: {
          ...nuxtConfig.viteConfig,
          server: {
            ...nuxtConfig.viteConfig.server,
            middlewareMode: false,
          },
          // define: nuxtConfig.viteConfig.define,
          // resolve: {
          //   alias: nuxtConfig.viteConfig.resolve.alias,
          //   extensions: nuxtConfig.viteConfig.resolve.extensions,
          //   dedupe: nuxtConfig.viteConfig.resolve.dedupe,
          // },
          // plugins,
          // css: nuxtConfig.viteConfig.css,
          // publicDir: nuxtConfig.viteConfig.publicDir,
          // optimizeDeps: nuxtConfig.viteConfig.optimizeDeps,
          // // @ts-expect-error Vue-specific config
          // vue: nuxtConfig.viteConfig.vue,
        },
        setupCode: [
          `${nuxt.options.css.map(file => `import '${file}'`).join('\n')}`,
          `import { setupNuxtApp } from '@histoire/plugin-nuxt/dist/runtime/app-setup.js'
          setupNuxtApp()`,
        ],
      }
    },

    onDev (api, onCleanup) {
      onCleanup(async () => {
        nuxt?.close()
      })
    },

    onBuild () {
      nuxt?.close()
    },
  }
}

async function useNuxtViteConfig () {
  const { loadNuxt, buildNuxt } = await import('@nuxt/kit')
  const nuxt = await loadNuxt({
    ready: false,
    dev: true,
    overrides: {
      ssr: false,
      app: {
        rootId: 'nuxt-test',
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
  nuxt.hook('imports:sources', presets => {
    const stubbedComposables = ['useNuxtApp']
    const appPreset = presets.find(p => p.from === '#app')
    appPreset.imports = appPreset.imports.filter(i => typeof i !== 'string' || !stubbedComposables.includes(i))
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
        nuxt.hook('vite:extendConfig', (config, { isClient }) => {
          // @ts-ignore
          if (isClient) {
            resolve({ ...config })
            throw new Error('_stop_')
          }
        })
      })
      nuxt.ready()
        .then(() => buildNuxt(nuxt))
        .catch(err => {
          if (!err.toString().includes('_stop_')) {
            reject(err)
          }
        })
        .finally(() => {
          nuxt.close()
        })
    }),
    nuxt,
  }
}
