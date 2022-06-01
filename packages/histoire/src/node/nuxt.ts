import { UserConfig } from 'vite'

export const getNuxtViteConfig = async () => {
  const { loadNuxt, buildNuxt } = await import('@nuxt/kit')
  const nuxt = await loadNuxt({
    ready: false,
    dev: true,
    overrides: {
      ssr: false,
    },
  })
  return await new Promise<UserConfig>((resolve) => {
    nuxt.hook('vite:extendConfig', (config, { isClient }) => {
      if (isClient) resolve({ ...config })
    })
    nuxt.ready().then(async () => {
      buildNuxt(nuxt)
    })
  })
}
