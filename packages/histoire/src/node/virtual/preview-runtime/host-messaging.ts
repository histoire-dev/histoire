/**
 * Emits `postToParent`, the single outbound channel to the host window. Every
 * message the sandbox sends (state sync, readiness, test results) goes through
 * it, which is why the target origin is pinned here.
 */
export function previewHostMessaging() {
  return `function postToParent(payload) {
  // Opened as a top-level tab (the sandbox URL is a normal page), \`window.parent\`
  // is this very window: posting would deliver our own messages back to us,
  // where the inbound handler accepts them as host messages and arms state
  // suppressions against edits nobody made.
  if (!window.parent || window.parent === window) {
    return
  }

  // Always post to our own origin. Every legitimate host builds the sandbox src
  // as a same-origin relative URL (getSandboxUrl), so the parent is same-origin
  // by construction. Deriving the target from document.referrer instead would
  // leak state/test payloads to any cross-origin page that embeds this sandbox
  // (nothing sets frame-ancestors), and '*' would leak to every origin. A
  // cross-origin host, if ever needed, should be an explicit allowlist.
  window.parent.postMessage({
    __histoire: true,
    ...payload,
  }, window.location.origin)
}`
}
