import type { HistoireEventSendMessage, HistoireTarget } from '@histoire/protocol'
import { EVENT_SEND } from './const'
import { cleanEventPayload } from './event-payload.js'
import { publishRuntimeEvent, resolveRuntimeEventTarget } from './runtime-events.js'

/**
 * Public `histoire/client` API: records an event fired by a story so it shows
 * up in the Events panel.
 *
 * Inside the preview sandbox the event has to cross the iframe boundary; in the
 * host document (docs/controls previews rendered natively) it goes straight to
 * the events store.
 *
 * @param name Event name displayed in the panel.
 * @param argument Event payload; DOM members are cleaned by {@link cleanEventPayload}.
 * @param target Explicit structured actor for delayed object-only events in a multi-variant grid.
 */
export async function logEvent(name: string, argument: unknown, target?: HistoireTarget) {
  console.log('[histoire] Event fired', { name, argument })
  const event = {
    name,
    argument: cleanEventPayload(argument),
  }
  if (location.href.includes('__sandbox')) {
    const message: HistoireEventSendMessage & Partial<HistoireTarget> = { type: EVENT_SEND, ...resolveRuntimeEventTarget(argument, target), event }
    // Same publisher as readiness/state: it stamps current selection version
    // and resolves actual embedding window even when a test runner patches parent.
    if (publishRuntimeEvent(message)) return
    // The host only dispatches frame messages carrying the `__histoire` marker
    // (`isTrustedPreviewFrameMessage`), so without it every event logged from a
    // story is silently dropped and never reaches the panel.
    // Target our own origin rather than '*': the sandbox is always same-origin
    // with the host (`getSandboxUrl` builds a relative URL), and a wildcard
    // would leak event payloads to any cross-origin page embedding the sandbox.
    window.parent?.postMessage({
      __histoire: true,
      ...message,
      // A WindowProxy survives navigation; attribute events to current document.
      documentId: (window as Window & { __HST_PREVIEW_DOCUMENT_ID__?: string }).__HST_PREVIEW_DOCUMENT_ID__,
    }, window.location.origin)
  }
  else {
    const { useEventsStore } = await import('../stores/events.js')
    useEventsStore().addEvent(event)
  }
}
