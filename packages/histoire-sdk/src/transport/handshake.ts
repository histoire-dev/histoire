import type { HistoireBridgeAck, HistoireBridgeHello, HistoirePortRole } from '@histoire/protocol'
import { HistoireSdkError, validateEmbedOrigin, validateHistoireAck } from '@histoire/protocol'
import { HISTOIRE_CONTROL_TIMEOUT } from './validation.js'
/** One explicit browser attachment; constructing SDK never evaluates these fields. */
export interface BridgeFrameOptions {
  /** Absolute normalized book base. */
  url: string
  /** Parent controller identity. */
  sessionId: string
  /** Unique bridge or surface identity. */
  mountId: string
  /** First-party document authority. */
  role: HistoirePortRole
  /** Explicit requested view, absent for metadata bridge. */
  surface?: string
  /** Owned attachment container. */
  container: HTMLElement
  /** Cancellation affects handshake immediately. */
  signal: AbortSignal
  /** Navigation retires current port; reconnect remains explicit. */
  disconnected?: () => void
}
let nextNonce = 0
/** Create one frame and transferred port, with exact-origin port-only acknowledgment. */
export function createBridgeFrame(options: BridgeFrameOptions) {
  const document = options.container.ownerDocument
  const parentWindow = document.defaultView
  if (!parentWindow) {
    throw new HistoireSdkError('BROWSER_REQUIRED', 'Attachment requires browser document')
  }
  const parentOrigin = validateEmbedOrigin(parentWindow.location.origin)
  const base = new URL(options.url)
  const url = new URL('__embed.html', base)
  const hello: HistoireBridgeHello = { kind: 'histoire:hello', protocolRange: { min: 1, max: 1 }, nonce: `${Date.now()}:${++nextNonce}:${Math.random()}`, sessionId: options.sessionId, mountId: options.mountId, parentOrigin, role: options.role }
  for (const [key, value] of Object.entries({ view: options.surface ? 'surface' : 'bridge', ...(options.surface ? { surface: options.surface } : {}), parentOrigin, sessionId: options.sessionId, mountId: options.mountId })) {
    url.searchParams.set(key, value)
  }
  const iframe = document.createElement('iframe')
  iframe.title = options.surface ? `Histoire ${options.surface}` : 'Histoire source bridge'
  iframe.style.cssText = options.surface ? 'border:0;width:100%;height:100%;display:block' : 'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  const channel = new MessageChannel()
  let active = true
  let loaded = false
  let acknowledged = false
  let rejectHandshake: (error: unknown) => void = () => {
  }
  let timer: ReturnType<typeof setTimeout>
  const ready = new Promise<{
    port: MessagePort
    ack: Extract<HistoireBridgeAck, {
      ok: true
    }>
  }>((resolve, reject) => {
    rejectHandshake = reject
    timer = setTimeout(() => reject(new HistoireSdkError('TIMEOUT', 'Source handshake timed out')), HISTOIRE_CONTROL_TIMEOUT)
    const receive = (event: MessageEvent) => {
      if (!active || acknowledged) {
        return
      }
      try {
        const ack = validateHistoireAck(event.data, hello)
        if (!ack.ok) {
          throw new HistoireSdkError(ack.error.code, ack.error.message, ack.error.details)
        }
        acknowledged = true
        clearTimeout(timer)
        channel.port1.removeEventListener('message', receive)
        resolve({ port: channel.port1, ack })
      }
      catch (error) {
        reject(error)
      }
    }
    channel.port1.addEventListener('message', receive)
    channel.port1.start()
  })
  void ready.catch(() => close())
  /** Mark attachment inactive before removing listeners, port or DOM. */
  function close(): void {
    if (!active) {
      return
    }
    active = false
    clearTimeout(timer)
    options.signal.removeEventListener('abort', abort)
    iframe.removeEventListener('load', load)
    iframe.removeEventListener('error', failed)
    channel.port1.close()
    channel.port2.close()
    iframe.remove()
    rejectHandshake(new HistoireSdkError('NOT_CONNECTED', 'Frame closed before handshake'))
  }
  /** Same WindowProxy navigation still retires old document and pending work. */
  function load(): void {
    if (!active) {
      return
    }
    if (loaded) {
      options.disconnected?.()
      close()
      return
    }
    loaded = true
    iframe.contentWindow?.postMessage(hello, base.origin, [channel.port2])
  }
  /** Network/navigation failure cannot masquerade as view readiness. */
  function failed(): void {
    rejectHandshake(new HistoireSdkError('BOOK_UNAVAILABLE', 'Source document failed to load'))
    close()
  }
  /** Controller cancellation settles handshake before releasing frame. */
  function abort(): void {
    rejectHandshake(options.signal.reason ?? new HistoireSdkError('CANCELLED', 'Connection cancelled'))
    close()
  }
  iframe.addEventListener('load', load)
  iframe.addEventListener('error', failed)
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) {
    abort()
  }
  else {
    try {
      iframe.src = url.href
      options.container.append(iframe)
    }
    catch (error) {
      close()
      throw error
    }
  }
  return { iframe, ready, close }
}
