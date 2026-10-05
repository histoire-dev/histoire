import type { PublicRuntimeConfig } from '@nuxt/schema'
import type { App } from 'h3'
import { createApp } from 'h3'
import { createFetch } from 'ofetch'
import { createNuxtSetupContext } from './nuxt-context.js'
import { initializeNuxtPreviewLifecycle } from './nuxt-lifecycle.js'

/** A real Histoire Vue app gets its own Nuxt payload and plugin lifecycle. */
interface NuxtPreviewSetup {
  /** Actual variant Vue app, never Nuxt's cached document entry app. */
  app: any
}

const initializedApps = new WeakMap<object, Promise<void>>()
let nextApp = 0
let setupContext: ReturnType<typeof createNuxtSetupContext> | undefined

/** Set up Nuxt on actual story app; existing callers without app retain entry compatibility. */
export async function setupNuxtApp(publicConfig: PublicRuntimeConfig, setupApi?: NuxtPreviewSetup, appConfig: { baseURL?: string, buildAssetsDir?: string, cdnURL?: string } = { baseURL: '/' }) {
  if (setupApi?.app && initializedApps.has(setupApi.app)) return initializedApps.get(setupApi.app)
  const pending = initialize()
  if (setupApi?.app) initializedApps.set(setupApi.app, pending)
  await pending

  /** Bootstrap data contains config only; each createNuxtApp allocates fresh state. */
  async function initialize() {
    const win = window as unknown as Window & { __app: App, __registry: Set<string>, __NUXT__: any, $fetch: any, Headers: typeof Headers }
    win.__NUXT__ = { serverRendered: false, config: { public: { ...publicConfig }, app: { baseURL: '/', ...appConfig } }, data: {}, state: {} }
    const h3App = createApp()
    const registry = new Set<string>()
    if (__HST_COLLECT__) {
      const { toNodeListener } = await import('h3')
      const { createCall, createFetch: createLocalFetch } = await import('unenv/runtime/fetch/index')
      // h3's Node adapter differs only in TypeScript server shape here.
      // @ts-expect-error Existing h3/unenv adapter compatibility.
      const localCall = createCall(toNodeListener(h3App))
      const localFetch = createLocalFetch(localCall, globalThis.fetch)
      win.fetch = (init: string, options?: any) => localFetch(typeof init === 'string' && registry.has(init) ? `/_${init}` : init, options)
    }
    win.$fetch = createFetch({ fetch: win.fetch, Headers: win.Headers })
    win.__registry = registry
    win.__app = h3App
    if (!setupApi?.app) {
      const app = win.document.createElement('div')
      app.id = 'nuxt-test'
      win.document.body.appendChild(app)
      // @ts-expect-error Nuxt resolves virtual app entry in consumer project.
      const entry = await import('#app/entry')
      await entry.default()
      return
    }
    // These are Nuxt's own plugin/app services; reuse them rather than mounting
    // its memoized #app/entry root, which shares useState across grid cells.
    // @ts-expect-error Nuxt consumer aliases resolve portable setup at runtime.
    const { createNuxtApp, applyPlugins, getNuxtAppCtx } = await import('#app/nuxt')
    // @ts-expect-error Generated consumer plugin inventory.
    const { default: plugins } = await import('#build/plugins')
    // @ts-expect-error Generated Nuxt application mode.
    const { multiApp } = await import('#build/nuxt.config.mjs')
    const id = `histoire-preview-${++nextApp}`
    // Other app plugins may delete bootstrap while imports await. Supply fresh
    // config immediately before synchronous construction under Nuxt's own mode.
    const payload = { serverRendered: false, config: { public: { ...publicConfig }, app: { baseURL: '/', ...appConfig } }, data: {}, state: {} }
    win.__NUXT__ = multiApp ? { ...win.__NUXT__, [id]: payload } : payload
    const nuxt = createNuxtApp({ vueApp: setupApi.app, id })
    nuxt.isHydrating = false
    const originalRun = nuxt.runWithContext.bind(nuxt)
    const fallback = getNuxtAppCtx()
    setupContext ??= createNuxtSetupContext(fallback)
    nuxt.runWithContext = (callback: () => unknown) => setupContext.call(nuxt, () => originalRun(callback))
    setupApi.app.__HST_NUXT_SETUP_CONTEXT__ = (callback: () => unknown) => setupContext.setup(nuxt, () => originalRun(callback))
    await initializeNuxtPreviewLifecycle(setupApi.app, nuxt._scope, () => {
      getNuxtAppCtx(nuxt._id).unset()
      if (fallback.tryUse() === nuxt) fallback.unset()
      delete win.__NUXT__?.[id]
    }, () => setupContext.setup(nuxt, async () => {
      await applyPlugins(nuxt, plugins)
      await nuxt.callHook('app:created', setupApi.app)
    }), stage => setupContext.setup(nuxt, () => originalRun(() => nuxt.callHook(stage, setupApi.app))))
  }
}
