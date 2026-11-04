import type { IncomingMessage, ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'

/** How a public HTTP exchange ended. */
export type ProxyRequestOutcome = 'completed' | 'failed' | 'aborted'

/**
 * Framework-neutral observation of one public HTTP exchange. Carries no query, header,
 * cookie or body: only what is needed to list real traffic. `key` is unique per proxy
 * and joins the two phases of one exchange.
 */
export type ProxyRequestEvent =
  | { phase: 'start', key: number, method: string, pathname: string }
  | { phase: 'end', key: number, method: string, pathname: string, status?: number, outcome: ProxyRequestOutcome, durationMs: number }

/** Receives request events; failures of the observer never reach the HTTP exchange. */
export type ProxyRequestObserver = (event: ProxyRequestEvent) => void

/** Longest pathname handed to observers; a longer one is cut (retention is bounded again by consumers). */
const PATHNAME_MAX = 2048

/** Handle returned for an observed exchange. */
export interface RequestObservation {
  /** Marks the exchange as failed by the proxy itself (e.g. it destroyed a half-sent response). */
  fail: () => void
}

/**
 * Pathname of a request target without query or fragment. Handles origin-form and
 * absolute-form targets; anything unparseable becomes `/`.
 * @param target Raw `request.url`.
 */
export function pathnameOf(target: string | undefined): string {
  let path = target ?? '/'
  if (!path.startsWith('/')) {
    try {
      path = new URL(path).pathname
    }
    catch {
      return '/'
    }
  }
  const cut = path.search(/[?#]/)
  return (cut === -1 ? path : path.slice(0, cut)).slice(0, PATHNAME_MAX)
}

/** Observer faults (including rejected promises) must not alter forwarding, nor produce diagnostics of their own. */
function emit(observer: ProxyRequestObserver, event: ProxyRequestEvent) {
  try {
    const result = observer(event) as unknown
    if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(() => {})
  }
  catch {}
}

/**
 * Observes one exchange. Must be called before the request is dispatched, so every
 * outcome is seen. Registers a single `close` listener on the response, which Node emits
 * after a normal finish and also when the client connection ends early; `finished` guards
 * against a second emission. An exchange whose response was not completely written when
 * `close` fired is `aborted`, even if backend work finishes later.
 * @param request Incoming request (only method and target are read).
 * @param response Outgoing response (never wrapped or modified).
 * @param key Unique exchange key.
 * @param observer Consumer of the events.
 */
export function observeRequest(request: IncomingMessage, response: ServerResponse, key: number, observer: ProxyRequestObserver): RequestObservation {
  const startedAt = performance.now()
  const method = (request.method ?? 'GET').slice(0, 32)
  const pathname = pathnameOf(request.url)
  let finished = false
  let failed = false
  emit(observer, { phase: 'start', key, method, pathname })
  response.once('close', () => {
    if (finished) return
    finished = true
    const complete = response.writableFinished
    const status = response.headersSent ? response.statusCode : undefined
    const outcome: ProxyRequestOutcome = !complete && !failed ? 'aborted' : failed || (status !== undefined && status >= 500) ? 'failed' : 'completed'
    emit(observer, { phase: 'end', key, method, pathname, ...(status === undefined ? {} : { status }), outcome, durationMs: Math.round((performance.now() - startedAt) * 10) / 10 })
  })
  return { fail: () => void (failed = true) }
}
