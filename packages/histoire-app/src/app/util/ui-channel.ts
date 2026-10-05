import type { UiClientEvents, UiServerEvents } from '@histoire/shared'

/** HMR exists only in development; static bundles fold away transport access. */
export function isUiChannelAvailable(): boolean {
  return !!import.meta.hot
}

/** Send a feature-owned typed development event after bounding its JSON bytes. */
export function sendUiEvent<K extends keyof UiClientEvents>(event: K, payload: UiClientEvents[K]): boolean
/** Feature extensions may register their own typed payload before declaration merge. */
export function sendUiEvent(event: `histoire:ui:${string}`, payload: unknown): boolean
/** HMR custom transport deliberately has no deployed HTTP fallback. */
export function sendUiEvent(event: string, payload: unknown): boolean {
  if (!import.meta.hot) return false
  const json = JSON.stringify(payload)
  if (json === undefined || new TextEncoder().encode(json).byteLength > 64 * 1024) throw new Error('UI payload exceeds 64 KB or is not JSON')
  import.meta.hot.send(event, payload)
  return true
}

/** Observe a typed feature notification and detach on component/session teardown. */
export function onUiEvent<K extends keyof UiServerEvents>(event: K, callback: (value: UiServerEvents[K]) => void): () => void
/** Additive feature-owned notifications retain their local DTO type. */
export function onUiEvent<T>(event: `histoire:ui:${string}`, callback: (value: T) => void): () => void
/** Subscribe without keeping any channel authority in static builds. */
export function onUiEvent(event: string, callback: (value: any) => void): () => void {
  import.meta.hot?.on(event, callback)
  return () => import.meta.hot?.off(event, callback)
}

/** Disconnected panes show unavailable until a reconnect delivers a fresh snapshot. */
export function onUiDisconnect(callback: () => void): () => void {
  import.meta.hot?.on('vite:ws:disconnect', callback)
  return () => import.meta.hot?.off('vite:ws:disconnect', callback)
}

if (import.meta.hot) {
  /** Resend snapshots after Vite restores this exact browser transport. */
  const ready = () => sendUiEvent('histoire:ui:ready', {})
  import.meta.hot.on('vite:ws:connect', ready)
  queueMicrotask(ready)
  import.meta.hot.dispose(() => import.meta.hot?.off('vite:ws:connect', ready))
}
