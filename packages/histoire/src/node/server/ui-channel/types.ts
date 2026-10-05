import type { ViteDevServer } from 'vite'

/** Originating Vite socket used for private request replies. */
export type UiChannelClient = Parameters<Parameters<ViteDevServer['ws']['on']>[1]>[1]

/** Dev-only extensible feature channel; each handler owns validation. */
export interface UiChannelServer {
  /** Validate and receive a bounded custom JSON event. */
  on: <T>(event: string, validate: (value: unknown) => T, handler: (payload: T, client: UiChannelClient) => void | Promise<void>) => () => void
  /** Send a bounded event to one client or every connected browser. */
  send: (event: string, data: unknown, client?: UiChannelClient) => void
  /** Supply current snapshots after browser initialization/reconnect. */
  onReady: (callback: (client: UiChannelClient) => void | Promise<void>) => () => void
  /** Register owned resource cleanup. */
  addCleanup: (callback: () => void | Promise<void>) => void
  /** Remove listeners before draining owned feature work. */
  close: () => Promise<void>
}
