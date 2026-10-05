import type { Router } from 'vue-router'
import { createDevEventApi } from './util/dev-event-api.js'

/**
 * Installs `window.__HST_PLUGIN_API__`, the bridge Histoire plugins use from
 * the browser to reach their node-side handlers.
 *
 * Dev-server only: it is pure `import.meta.hot` wiring, which does not exist in
 * a built app. The request/reply correlation itself lives in
 * {@link createDevEventApi} so it can be exercised without a live Vite WS
 * server.
 */
export function setupPluginApi(router: Router) {
  if (!import.meta.hot) return

  const { sendEvent, close } = createDevEventApi({
    send: payload => import.meta.hot.send('histoire:dev-event', payload),
    onResult: (listener) => {
      import.meta.hot.on('histoire:dev-event-result', listener)
      return () => import.meta.hot.off('histoire:dev-event-result', listener)
    },
  })

  const previous = window.__HST_PLUGIN_API__
  const api = {
    sendEvent,

    openStory: (storyId: string) => {
      router.push({ name: 'story', params: { storyId } })
    },
  }
  window.__HST_PLUGIN_API__ = api
  return () => {
    close()
    if (window.__HST_PLUGIN_API__ === api) {
      if (previous) window.__HST_PLUGIN_API__ = previous
      else delete window.__HST_PLUGIN_API__
    }
  }
}
