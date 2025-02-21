import type { PublicRuntimeConfig } from '@nuxt/schema'
import type { App } from 'h3'
import { createApp } from 'h3'
import { createFetch } from 'ofetch'

export async function setupNuxtApp(publicConfig: PublicRuntimeConfig) {
  const win = window as unknown as Window & {
    __app: App
    __registry: Set<string>
    __NUXT__: any
    $fetch: any
    fetch: any
    IntersectionObserver: any
    Headers: any
  }

  win.__NUXT__ = {
    serverRendered: false,
    config: {
      public: { ...publicConfig },
      app: { baseURL: '/' },
    },
    data: {},
    state: {},
  }

  const app = win.document.createElement('div')
  // this is a workaround for a happy-dom bug with ids beginning with _
  app.id = 'nuxt-test'
  win.document.body.appendChild(app)

  win.IntersectionObserver
      = win.IntersectionObserver
        || class IntersectionObserver {
          observe() {
          // noop
          }
        }

  const h3App = createApp()

  const registry = new Set<string>()

  if (__HST_COLLECT__) {
    const {
      toNodeListener,
    } = await import('h3')
    const {
      createCall,
      createFetch: createLocalFetch,
    } = await import('unenv/runtime/fetch/index')
    // @ts-expect-error TODO: fix in h3
    const localCall = createCall(toNodeListener(h3App))
    const localFetch = createLocalFetch(localCall, globalThis.fetch)

    win.fetch = (init: string, options?: any) => {
      if (typeof init === 'string' && registry.has(init)) {
        init = `/_${init}`
      }
      return localFetch(init, options)
    }
  }

  win.$fetch = createFetch({ fetch: win.fetch, Headers: win.Headers as any })

  win.__registry = registry
  win.__app = h3App

  // @ts-expect-error no types
  const result = await import('#app/entry')
  await result.default()
}
