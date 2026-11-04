import type { ProxyRequestEvent } from '@histoire/dev-proxy'
import type { RequestRecord } from '../protocol/requests.js'
import { createBoundedHistory } from '../history/bounded.js'
import { sanitizeText } from '../output/sanitize.js'
import { TERMINAL_BOUNDS, truncateText } from '../protocol/core.js'
import { REQUEST_BOUNDS } from '../protocol/requests.js'

/** Bounded session history of public HTTP exchanges. */
export interface RequestHistory {
  /** Proxy `onRequest`: tracks starts and retains finished exchanges. Never throws. */
  onEvent: (event: ProxyRequestEvent) => void
  /** Retained finished exchanges, oldest first. */
  entries: () => readonly RequestRecord[]
  /** Exchanges evicted by retention since the session began (not by `clear`). */
  readonly omitted: number
  /** Exchanges started and not yet ended, among the tracked ones. */
  inFlight: () => number
  /** Deletes retained records; identifiers keep increasing and in-flight tracking continues. */
  clear: () => void
  /** Notifies after each change; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/**
 * Creates the request history. Retains 500 finished exchanges; live tracking holds only
 * numeric keys, capped, so stalled connections cannot accumulate metadata.
 * @param options Options.
 * @param options.secrets Credentials to redact from paths.
 * @param options.entries Retained entries override (tests).
 * @param options.inFlight Tracked in-flight override (tests).
 */
export function createRequestHistory(options: { secrets?: readonly string[], entries?: number, inFlight?: number } = {}): RequestHistory {
  const history = createBoundedHistory<RequestRecord>({ entries: options.entries ?? TERMINAL_BOUNDS.requestEntries })
  const maxLive = options.inFlight ?? REQUEST_BOUNDS.inFlight
  /** Keys of started exchanges, oldest first (a `Set` keeps insertion order). */
  const live = new Set<number>()

  /** Pathname made safe for display and copy: controls removed, credential redacted, bounded. */
  function clean(text: string, max: number) {
    return truncateText(sanitizeText(text, options.secrets ?? []), max).text
  }

  return {
    get omitted() {
      return history.omitted
    },
    entries: history.entries,
    clear: history.clear,
    subscribe: history.subscribe,
    inFlight: () => live.size,
    onEvent(event) {
      try {
        if (event.phase === 'start') {
          live.add(event.key)
          // Stalled connections must not grow tracking: forget the oldest one (its record is still produced when it ends).
          if (live.size > maxLive) live.delete(live.values().next().value!)
          history.touch()
          return
        }
        live.delete(event.key)
        history.append(id => ({
          id,
          method: clean(event.method, REQUEST_BOUNDS.methodLength),
          pathname: clean(event.pathname, REQUEST_BOUNDS.pathLength),
          ...(event.status === undefined ? {} : { status: event.status }),
          outcome: event.outcome,
          durationMs: event.durationMs,
        }))
      }
      catch {}
    },
  }
}
