import { installedPlugins } from 'virtual:$histoire-config'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { createClientUuid } from '../../../util/dev-event-api.js'
import { uiHttpUrl } from '../../../util/http-json.js'

/** A controlled rejection received before the runtime restarts. */
class PluginRequestError extends Error {}

/** Stages plugin changes locally until the user explicitly restarts Histoire. */
export function usePluginToggles() {
  const staged = ref<Record<string, boolean>>({})
  const pending = ref(false)
  const error = ref('')
  const key = `_histoire-plugin-change:${import.meta.env.BASE_URL}`
  const endpoint = uiHttpUrl('plugins/toggle')
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const changes = computed(() => installedPlugins.flatMap((plugin) => {
    if (!plugin.toggleId || staged.value[plugin.toggleId] === undefined || staged.value[plugin.toggleId] === plugin.enabled) return []
    return [{ id: plugin.toggleId, enabled: staged.value[plugin.toggleId] }]
  }))

  /** Reads the staged state without changing the running plugin. */
  function value(id: string, enabled: boolean): boolean {
    return staged.value[id] ?? enabled
  }
  /** Stages or removes one change. */
  function set(id: string, enabled: boolean): void {
    staged.value = { ...staged.value, [id]: enabled }
    error.value = ''
  }
  /** Drops unsubmitted changes. */
  function discard(): void {
    staged.value = {}
    error.value = ''
  }
  /** Calls the dev endpoint with the browser's same-origin credentials. */
  async function request(body: object) {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json() as { completion?: string, error?: string }
    if (!response.ok) throw new PluginRequestError(result.error || 'Plugin request failed.')
    return result
  }
  /** Waits across the server restart for its successor's explicit receipt. */
  async function poll(id: string, started: number): Promise<void> {
    if (stopped) return
    if (Date.now() - started > 60_000) {
      pending.value = false
      error.value = 'Restart could not be confirmed. Check the server output and reload settings.'
      sessionStorage.removeItem(key)
      return
    }
    try {
      const result = await request({ action: 'status', requestId: id })
      if (stopped) return
      if (result.completion === 'saved') {
        sessionStorage.removeItem(key)
        window.location.reload()
        return
      }
      if (result.completion === 'failed') {
        sessionStorage.removeItem(key)
        pending.value = false
        error.value = result.error || 'Plugin changes could not be confirmed.'
        return
      }
    }
    catch { /* The server may be unavailable while restarting. */ }
    if (!stopped) timer = setTimeout(() => void poll(id, started), 1000)
  }
  /** Saves all staged switches together and leaves a receipt for the next page. */
  async function apply(): Promise<void> {
    if (pending.value || !changes.value.length) return
    const requestId = createClientUuid()
    const started = Date.now()
    pending.value = true
    error.value = ''
    sessionStorage.setItem(key, JSON.stringify({ requestId, started }))
    try {
      await request({ action: 'apply', requestId, changes: changes.value })
      if (!stopped) void poll(requestId, started)
    }
    catch (cause) {
      // A restart can close the request after the write; the receipt decides the outcome.
      if (cause instanceof PluginRequestError && !stopped) {
        sessionStorage.removeItem(key)
        pending.value = false
        error.value = cause.message
      }
      else if (!stopped) {
        void poll(requestId, started)
      }
    }
  }
  onMounted(() => {
    if (!__HISTOIRE_DEV__) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { requestId?: string, started?: number } | null
      if (saved && typeof saved.requestId === 'string' && typeof saved.started === 'number') {
        pending.value = true
        void poll(saved.requestId, saved.started)
      }
    }
    catch { sessionStorage.removeItem(key) }
  })
  onUnmounted(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })
  return { changes, pending, error, value, set, discard, apply }
}
