import { router } from './router.js'
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
export function setupPluginApi() {
  if (!import.meta.hot) return

  const { sendEvent } = createDevEventApi({
    send: payload => import.meta.hot.send('histoire:dev-event', payload),
    onResult: listener => import.meta.hot.on('histoire:dev-event-result', listener),
  })

  window.__HST_PLUGIN_API__ = {
    sendEvent,

    openStory: (storyId: string) => {
      router.push({ name: 'story', params: { storyId } })
    },
  }
}
