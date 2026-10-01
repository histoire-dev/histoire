/**
 * Emits `getHostWindow` and `postToParent`, the single outbound channel to the
 * host window. Every message the sandbox sends (state sync, readiness, test
 * results) goes through it, which is why the target origin is pinned here.
 */
export function previewHostMessaging() {
  return `function getHostWindow() {
  // \`window.parent\` is NOT a reliable way to tell whether we are embedded:
  // test runners (Cypress) patch it to point at the sandbox itself while the
  // document boots, to defeat framebusting. Trusting it there drops every
  // message posted during boot — readiness included — and the host waits
  // forever. \`frameElement\` is the embedding <iframe> itself: it survives that
  // patching and is null when the sandbox URL is opened as a normal top-level
  // tab, which is exactly the case we must not post in (posting would deliver
  // our own messages back to us, where the inbound handler accepts them as
  // host messages and arms state suppressions against edits nobody made).
  let frameElement
  try {
    frameElement = window.frameElement
  }
  catch (e) {
    // Cross-origin embedder: not a host we talk to (see the origin note below).
    return null
  }

  if (!frameElement) {
    return null
  }

  const hostWindow = frameElement.ownerDocument?.defaultView
  return hostWindow && hostWindow !== window ? hostWindow : null
}

function postToParent(payload) {
  const hostWindow = getHostWindow()
  if (!hostWindow) {
    return
  }

  // Always post to our own origin. Every legitimate host builds the sandbox src
  // as a same-origin relative URL (getSandboxUrl), so the host is same-origin
  // by construction. Deriving the target from document.referrer instead would
  // leak state/test payloads to any cross-origin page that embeds this sandbox
  // (nothing sets frame-ancestors), and '*' would leak to every origin. A
  // cross-origin host, if ever needed, should be an explicit allowlist.
  hostWindow.postMessage({
    __histoire: true,
    ...payload,
  }, window.location.origin)
}`
}
