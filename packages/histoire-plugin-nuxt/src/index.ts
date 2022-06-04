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

    async config () {
      const nuxtConfig = await useNuxtViteConfig()
      nuxt = nuxtConfig.nuxt
      const plugins = nuxtConfig.viteConfig.plugins.filter((p: any) => !ignorePlugins.includes(p?.name))
      return {
        vite: {
          define: nuxtConfig.viteConfig.define,
          resolve: {
            alias: nuxtConfig.viteConfig.resolve.alias,
            extensions: nuxtConfig.viteConfig.resolve.extensions,
          },
          plugins,
          css: nuxtConfig.viteConfig.css,
          publicDir: nuxtConfig.viteConfig.publicDir,
          optimizeDeps: nuxtConfig.viteConfig.optimizeDeps,
          // @ts-expect-error Vue-specific config
          vue: nuxtConfig.viteConfig.vue,
        },
        setupCode: [
          `${nuxt.options.css.map(file => `import '${file}'`).join('\n')}`,
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
    },
  })
  if (nuxt.options.builder as string !== '@nuxt/vite-builder') {
    throw new Error(`Histoire only supports Vite bundler, but Nuxt builder is currently set to '${nuxt.options.builder}'.`)
  }
  return {
    viteConfig: await new Promise<ViteConfig>((resolve) => {
      nuxt.hook('vite:extendConfig', (config, { isClient }) => {
        if (isClient) resolve({ ...config })
      })
      nuxt.ready().then(async () => {
        buildNuxt(nuxt)
      })
    }),
    nuxt,
  }
}
