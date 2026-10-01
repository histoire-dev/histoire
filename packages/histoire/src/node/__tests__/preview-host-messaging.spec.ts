import { describe, expect, it, vi } from 'vitest'
import { previewHostMessaging } from '../virtual/preview-runtime/host-messaging.js'
import { readAppSource } from './utils/app-source.js'

/**
 * Executes the generated outbound channel of the preview runtime.
 *
 * It is emitted as source text, so it runs here in a `with` scope supplying the
 * `window` it reads. What matters is which window it resolves as the host —
 * getting that wrong silently drops every message the sandbox sends and leaves
 * the host waiting for a readiness event that never arrives.
 */
function createOutboundChannel(window: Record<string, any>) {
  const scope = new Proxy({ window }, {
    has: () => true,
    get: (target, key) => (key in target ? target[key as keyof typeof target] : (globalThis as any)[key]),
  })

  // eslint-disable-next-line no-new-func -- the runtime only exists as source text
  return new Function('scope', `with (scope) { ${previewHostMessaging()}; return { getHostWindow, postToParent } }`)(scope)
}

/** Builds a sandbox `window` embedded in `hostWindow` through an iframe. */
function createEmbeddedWindow(hostWindow: Record<string, any>, overrides: Record<string, any> = {}) {
  const window: Record<string, any> = {
    location: { origin: 'http://localhost:3000' },
    ...overrides,
  }
  window.frameElement = overrides.frameElement !== undefined
    ? overrides.frameElement
    : { ownerDocument: { defaultView: hostWindow } }
  return window
}

describe('preview runtime outbound channel', () => {
  it('posts to the window embedding the sandbox', () => {
    const hostWindow = { postMessage: vi.fn() }
    const channel = createOutboundChannel(createEmbeddedWindow(hostWindow))

    channel.postToParent({ type: 'test' })

    expect(hostWindow.postMessage).toHaveBeenCalledWith(
      { __histoire: true, type: 'test' },
      'http://localhost:3000',
    )
  })

  it('resolves the host through the frame element, not `window.parent`', () => {
    // Test runners (Cypress) patch `window.parent` to the sandbox itself while
    // the document boots, to defeat framebusting. Trusting it there drops every
    // message posted during boot — readiness included.
    const hostWindow = { postMessage: vi.fn() }
    const window = createEmbeddedWindow(hostWindow)
    window.parent = window

    const channel = createOutboundChannel(window)
    channel.postToParent({ type: 'test' })

    expect(channel.getHostWindow()).toBe(hostWindow)
    expect(hostWindow.postMessage).toHaveBeenCalled()
  })

  it('posts nothing when the sandbox URL is opened as a top-level tab', () => {
    // Posting would deliver our own messages back to us, where the inbound
    // handler takes them for host messages.
    const window = createEmbeddedWindow({}, { frameElement: null })
    window.postMessage = vi.fn()

    const channel = createOutboundChannel(window)
    channel.postToParent({ type: 'test' })

    expect(channel.getHostWindow()).toBe(null)
    expect(window.postMessage).not.toHaveBeenCalled()
  })

  it('posts nothing when the embedder is cross-origin', () => {
    // Reading `frameElement` throws in that case.
    const window: Record<string, any> = { location: { origin: 'http://localhost:3000' } }
    Object.defineProperty(window, 'frameElement', {
      get() {
        throw new Error('SecurityError')
      },
    })

    const channel = createOutboundChannel(window)

    expect(channel.getHostWindow()).toBe(null)
    expect(() => channel.postToParent({ type: 'test' })).not.toThrow()
  })
})

describe('host state ownership', () => {
  const source = readAppSource('app/util/preview-iframe-host.ts')

  it('does not seed a newly loaded preview from the host mirror', () => {
    const loadHandler = source.match(/function onIframeLoad\(\) \{([\s\S]*?)\n {2}\}/)?.[1]
    expect(loadHandler).toBeTruthy()
    expect(loadHandler).not.toContain('syncState()')
  })

  it('does not echo the boot snapshot back after variant readiness', () => {
    const readyHandler = source.match(/function markVariantReady\([^)]*\) \{([\s\S]*?)\n {2}\}/)?.[1]
    expect(readyHandler).toBeTruthy()
    expect(readyHandler).not.toContain('syncState()')
  })
})
