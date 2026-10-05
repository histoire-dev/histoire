import { createControlsOverlayBridge } from '@histoire/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('controls overlay bridge', () => {
  let frame: HTMLIFrameElement
  let anchor: HTMLButtonElement
  let bridge: ReturnType<typeof createControlsOverlayBridge>
  const post = vi.fn()

  beforeEach(() => {
    frame = document.createElement('iframe')
    anchor = document.createElement('button')
    document.body.append(frame, anchor)
    bridge = createControlsOverlayBridge({ window, host: frame.contentWindow!, storyId: 'story', variantId: 'variant', post })
    post.mockClear()
  })

  afterEach(() => {
    bridge?.dispose()
    frame.remove()
    anchor.remove()
  })

  /** Delivers a reply as if it came from the embedding Histoire document. */
  function reply(id: string, overrides: Record<string, unknown> = {}, origin = window.location.origin, source = frame.contentWindow) {
    window.dispatchEvent(new MessageEvent('message', {
      origin,
      source,
      data: { __histoire: true, type: '__histoire:controls-overlay-result', storyId: 'story', variantId: 'variant', id, itemId: 'option', ...overrides },
    }))
  }

  it('routes selected IDs to local callbacks once and rejects stale replies', () => {
    const callback = vi.fn()
    const handle = bridge.open(anchor, { kind: 'select', items: [{ id: 'option', label: 'Option' }] }, callback)
    expect(post.mock.calls[0][0].overlay.items).toEqual([{ id: 'option', label: 'Option' }])
    reply(handle.id, { storyId: 'another-story' })
    reply(handle.id, { variantId: 'another-variant' })
    reply(handle.id, {}, 'https://other.test')
    reply(handle.id, {}, window.location.origin, window)
    reply(handle.id, { __histoire: false })
    expect(callback).not.toHaveBeenCalled()
    reply(handle.id)
    reply(handle.id)
    expect(callback).toHaveBeenCalledExactlyOnceWith({ itemId: 'option', restoreFocus: false })
  })

  it('rejects disabled results even when a trusted host sends them', () => {
    const callback = vi.fn()
    const handle = bridge.open(anchor, { kind: 'select', items: [{ id: 'option', label: 'Option', disabled: true }] }, callback)
    reply(handle.id)
    expect(callback).not.toHaveBeenCalled()
    handle.update({ kind: 'select', items: [{ id: 'option', label: 'Option' }] })
    reply(handle.id)
    expect(callback).toHaveBeenCalledExactlyOnceWith({ itemId: 'option', restoreFocus: false })
  })

  it('refreshes geometry and stops sending updates after close', () => {
    const rect = vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 20, width: 100, height: 27 } as DOMRect)
    const handle = bridge.open(anchor, { kind: 'tooltip', content: 'Label' }, vi.fn())
    rect.mockReturnValue({ x: 15, y: 30, width: 100, height: 27 } as DOMRect)
    reply(handle.id, { type: '__histoire:controls-overlay-refresh' })
    expect(post.mock.lastCall![0].anchor).toEqual({ x: 15, y: 30, width: 100, height: 27 })
    handle.close()
    post.mockClear()
    handle.update({ kind: 'tooltip', content: 'Changed' })
    reply(handle.id, { type: '__histoire:controls-overlay-refresh' })
    expect(post).not.toHaveBeenCalled()
  })

  it('drops unknown option IDs and closes overlays during disposal', () => {
    const callback = vi.fn()
    const handle = bridge.open(anchor, { kind: 'select', items: [{ id: 'option', label: 'Option' }] }, callback)
    reply(handle.id, { itemId: 'unknown' })
    expect(callback).not.toHaveBeenCalled()
    bridge.dispose()
    expect(post.mock.lastCall![0]).toMatchObject({ id: handle.id, overlay: null })
    reply(handle.id)
    expect(callback).not.toHaveBeenCalled()
  })
})
