/**
 * Request/reply correlation for the dev-server "plugin event" channel exposed
 * as `window.__HST_PLUGIN_API__.sendEvent`.
 *
 * Extracted from the `import.meta.hot` wiring in `plugin.ts` so the correlation
 * rules — which reply settles which promise, and what happens when none ever
 * arrives — are plain logic over an injected transport.
 */

import { type HistoireErrorCode, HistoireSdkError } from '@histoire/protocol'

/** Payload of a `histoire:dev-event-result` message from the dev server. */
export interface DevEventResult {
  /** Name of the event this result answers. */
  event: string
  /** Id of the request it answers; absent for legacy plugin replies. */
  requestId?: string
  /** Value to resolve `sendEvent` with. */
  result?: any
  /** Message to reject `sendEvent` with. */
  error?: string
  /** Stable source-retirement category preserved across the dev channel. */
  code?: HistoireErrorCode
  /** Completed subset, never a terminal reply. */
  progress?: unknown
}

/** The dev-server channel `createDevEventApi` drives. */
export interface DevEventTransport {
  /** Sends a `histoire:dev-event` request to the dev server. */
  send: (payload: { event: string, payload?: any, requestId: string }) => void
  /** Subscribes to every `histoire:dev-event-result` message. */
  onResult: (listener: (result: DevEventResult) => void) => void | (() => void)
  /** Optional additive stream for socket-owned collection requests. */
  onProgress?: (listener: (result: DevEventResult) => void) => void | (() => void)
  /** Disconnect retires pending streams while allowing later requests after reconnection. */
  onDisconnect?: (listener: () => void) => void | (() => void)
}

/**
 * Backstop before a lost result message rejects the promise.
 *
 * The node run has a 300s safety cap, so this must stay comfortably longer than
 * any legitimate run or it would kill a real one.
 */
export const DEV_EVENT_TIMEOUT = 360_000

/** Local request backstop; these options never enter a server request payload. */
export interface DevEventRequestOptions {
  /** Milliseconds before cancelling a request whose terminal reply was lost. */
  timeoutMs?: number
}

/**
 * Builds a per-browser-client id used to prefix request ids.
 *
 * A plain counter restarts at 1 in every tab, so two tabs would generate the
 * same ids and a plugin broadcasting its reply could settle the wrong tab's
 * request. `crypto.randomUUID` needs a secure context (absent on plain-http LAN
 * dev), hence the random+time fallback.
 */
export function createClientId() {
  try {
    return createClientUuid()
  }
  catch { /* Legacy plugin correlation also supports hosts without Web Crypto. */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** UUID correlation stays available on HTTP/LAN through Web Crypto random bytes. */
export function createClientUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') throw new Error('Secure random values unavailable')
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0F) | 0x40
  bytes[8] = (bytes[8] & 0x3F) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Creates the `sendEvent` half of the dev plugin API.
 *
 * @param transport Dev-server channel to send requests on and receive results from.
 */
export function createDevEventApi(transport: DevEventTransport) {
  const listeners: Record<string, Set<(result: DevEventResult) => void>> = {}
  const clientId = createClientId()
  let requestCounter = 0
  let closed = false
  const pending = new Set<(failure?: unknown) => void>()

  const offResult = transport.onResult((result) => {
    // Forward the whole result (including `error`) so `sendEvent` can reject on
    // failure instead of waiting forever for a value that never arrives.
    for (const listener of listeners[result.event] ?? []) {
      listener(result)
    }
  })
  const offProgress = transport.onProgress?.((result) => {
    if (closed || result.requestId === undefined) return
    for (const listener of listeners[result.event] ?? []) listener(result)
  })
  const offDisconnect = transport.onDisconnect?.(() => {
    for (const cancel of [...pending]) cancel(new Error('Histoire dev event connection closed.'))
  })

  /**
   * Registers a result listener for one event.
   * @returns A disposer detaching it again.
   */
  function addListener(event: string, listener: (result: DevEventResult) => void) {
    const set = listeners[event] ??= new Set()
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  /**
   * Sends an event to the dev server and awaits its result.
   *
   * Events named `on*` are fire-and-forget hooks: the dev server never replies,
   * so the promise resolves immediately instead of waiting out the backstop.
   *
   * @param event Event name handled by a Histoire plugin on the node side.
   * @param payload Arbitrary JSON payload for that plugin.
   * @param signal Cancels exact server-side test work after request admission.
   * @param onProgress Observes correlated completed collection subsets.
   * @param options Local timeout override; other events retain the default backstop.
   */
  function sendEvent(event: string, payload?: any, signal?: AbortSignal, onProgress?: (progress: any) => void, options: DevEventRequestOptions = {}) {
    const operation = new Promise<any>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? DEV_EVENT_TIMEOUT
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        reject(new HistoireSdkError('INVALID_ARGUMENT', 'Dev event timeout must be positive'))
        return
      }
      if (closed) {
        reject(new Error('Histoire dev event API closed.'))
        return
      }
      if (signal?.aborted) {
        reject(new Error('Histoire dev event request cancelled.'))
        return
      }
      const requestId = `${clientId}-${++requestCounter}`

      if (event.startsWith('on')) {
        transport.send({ event, payload, requestId })
        resolve(undefined)
        return
      }

      // Held so both the result handler and the timeout can detach the listener
      // before settling.
      let off: () => void = () => {}
      let timeout: ReturnType<typeof setTimeout>
      let removeAbort = () => {}
      /** Revoke stream ownership before asking server to cancel; preserve validation failures. */
      function cancelRequest(failure: unknown) {
        off()
        clearTimeout(timeout)
        removeAbort()
        pending.delete(cancel)
        try {
          if (event === 'runStoryTests' || event === 'collectStoryTests') transport.send({ event: 'cancelStoryTests', payload: { requestId }, requestId })
        }
        catch { /* Server disconnect already cancels socket-owned work. */ }
        reject(failure)
      }
      /** API closure and socket retirement share exact listener/timer ownership. */
      function cancel(failure: unknown = new Error('Histoire dev event API closed.')) {
        cancelRequest(failure)
      }

      timeout = setTimeout(() => {
        cancelRequest(new HistoireSdkError('TIMEOUT', `Histoire dev event "${event}" timed out after ${timeoutMs / 1000}s without a result.`))
      }, timeoutMs)

      off = addListener(event, ({ requestId: resultRequestId, result, error, code, progress }) => {
        // Results reach every client and every pending call of this event — only
        // settle with our own. Replies without a request id come from legacy
        // plugin handlers and still settle anyone waiting.
        if (resultRequestId !== undefined && String(resultRequestId) !== requestId) {
          return
        }
        if (progress !== undefined) {
          if (resultRequestId !== requestId) return
          try {
            onProgress?.(progress)
          }
          catch (failure) {
            cancelRequest(failure)
          }
          return
        }

        off()
        removeAbort()
        pending.delete(cancel)
        clearTimeout(timeout)
        if (error) {
          reject(code ? new HistoireSdkError(code, error) : new Error(error))
        }
        else {
          resolve(result)
        }
      })
      pending.add(cancel)
      const abort = () => cancelRequest(new Error('Histoire dev event request cancelled.'))
      signal?.addEventListener('abort', abort, { once: true })
      removeAbort = () => signal?.removeEventListener('abort', abort)
      // Install listeners first: even synchronous adapters can report progress.
      try {
        transport.send({ event, payload, requestId })
      }
      catch (failure) { cancelRequest(failure) }
    })
    void operation.catch(() => {})
    return operation
  }

  /** Caller teardown removes channel authority and settles every abandoned request. */
  function close() {
    if (closed) return
    closed = true
    try {
      if (typeof offResult === 'function') offResult()
      if (typeof offProgress === 'function') offProgress()
      if (typeof offDisconnect === 'function') offDisconnect()
    }
    finally {
      for (const cancel of [...pending]) cancel()
    }
  }
  return { sendEvent, close }
}
