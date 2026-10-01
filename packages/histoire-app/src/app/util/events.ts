import { EVENT_SEND } from './const'

/**
 * Public `histoire/client` API: records an event fired by a story so it shows
 * up in the Events panel.
 *
 * Inside the preview sandbox the event has to cross the iframe boundary; in the
 * host document (docs/controls previews rendered natively) it goes straight to
 * the events store.
 *
 * @param name Event name displayed in the panel.
 * @param argument Event payload; DOM events are flattened first (see {@link stringifyEvent}).
 */
export async function logEvent(name: string, argument) {
  console.log('[histoire] Event fired', { name, argument })
  const event = {
    name,
    argument: JSON.parse(stringifyEvent(argument)), // Needed for HTMLEvent that can't be cloned
  }
  if (location.href.includes('__sandbox')) {
    // The host only dispatches frame messages carrying the `__histoire` marker
    // (`isTrustedPreviewFrameMessage`), so without it every event logged from a
    // story is silently dropped and never reaches the panel.
    // Target our own origin rather than '*': the sandbox is always same-origin
    // with the host (`getSandboxUrl` builds a relative URL), and a wildcard
    // would leak event payloads to any cross-origin page embedding the sandbox.
    window.parent?.postMessage({
      __histoire: true,
      type: EVENT_SEND,
      event,
    }, window.location.origin)
  }
  else {
    const { useEventsStore } = await import('../stores/events.js')
    useEventsStore().addEvent(event)
  }
}

/**
 * Serializes an event-like object to JSON, keeping inherited accessor
 * properties (DOM events expose everything on their prototype) and replacing
 * values that cannot cross a structured-clone boundary.
 */
function stringifyEvent(e) {
  const obj = {}
  for (const k in e) {
    obj[k] = e[k]
  }
  return JSON.stringify(obj, (k, v) => {
    if (v instanceof Node) return 'Node'
    if (v instanceof Window) return 'Window'
    return v
  }, ' ')
}
