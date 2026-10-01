/**
 * Returns true when a postMessage event genuinely came from the preview frame.
 *
 * Defense-in-depth for the live preview: the preview iframe is served
 * same-origin as the host, so legitimate traffic carries the `__histoire`
 * marker, comes from that exact frame's window and from the host origin. Any
 * mismatch — including no frame being mounted at all — means the message must
 * be ignored. The event `origin` check is skipped only when the event itself
 * carries no origin (some environments omit it for same-frame messages).
 *
 * @param event - The received message event (or a minimal shape thereof).
 * @param event.source - The window that posted the message.
 * @param event.origin - The origin the message was posted from.
 * @param event.data - The structured-cloned message payload.
 * @param frame - The iframe the message must come from.
 * @returns Whether the message can be trusted as coming from that preview frame.
 */
export function isTrustedPreviewFrameMessage(
  event: { source?: unknown, origin?: string, data?: any },
  frame?: { contentWindow?: unknown } | null,
): boolean {
  const source = frame?.contentWindow
  if (!source) {
    return false
  }
  if (!event?.data?.__histoire) {
    return false
  }
  if (event.source !== source) {
    return false
  }
  if (event.origin && event.origin !== window.location.origin) {
    return false
  }
  return true
}
