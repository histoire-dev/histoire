import type { UiChannelClient } from './types.js'

/** Request-scoped view of one browser socket's live connection. */
export interface UiClientConnection {
  /** Report open state and deliver close notification at most once. */
  isOpen: () => boolean
  /** Remove the listener and suppress future notifications. */
  dispose: () => void
}

/**
 * Observe one open socket before work is admitted; closed sockets start closed.
 * @param client Socket owner being observed.
 * @param onDisconnect Called once when an observed open socket closes.
 */
export function observeUiClientConnection(client: UiChannelClient, onDisconnect: () => void): UiClientConnection {
  let open = client.socket.readyState === 1
  let disposed = false

  /** Normalize close events and late ready-state changes into one transition. */
  function disconnect(): void {
    if (!open) return
    open = false
    onDisconnect()
  }

  if (open) client.socket.once('close', disconnect)

  return {
    isOpen() {
      if (open && client.socket.readyState !== 1) disconnect()
      return open && !disposed
    },
    dispose() {
      if (disposed) return
      disposed = true
      open = false
      client.socket.off('close', disconnect)
    },
  }
}
