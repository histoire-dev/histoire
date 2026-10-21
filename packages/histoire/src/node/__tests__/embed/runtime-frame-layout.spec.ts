// @vitest-environment jsdom
import { PREVIEW_SETTINGS_SYNC, RUNTIME_LAYOUT, STATE_SYNC, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'

/** Queue animation frames so each test decides when layout work runs. */
function animationFrames() {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame))
  return {
    /** Number of scheduled callbacks. */
    pending: () => frames.size,
    /** Run every scheduled callback once. */
    flush() {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback(0))
    },
  }
}

/** Ready runtime with fixed iframe geometry and one reported sandbox viewport. */
async function readyFrame() {
  const fixture = await createRuntimeFrameFixture({ standalone: true })
  const frame = fixture.container.querySelector('iframe')!
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 240 })
  const rect = vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240))
  frame.dispatchEvent(new Event('load'))
  publishFrameMessage(frame, VARIANT_READY)
  await fixture.primary.ready
  const box = { x: 0, y: 0, width: 320, height: 240 }
  publishFrameMessage(frame, RUNTIME_LAYOUT, undefined, { viewports: [{ ...box, target: { storyId: 'a:b', variantId: 'c' }, scale: 1, visibleRect: box }] })
  /** Host layout publications so far. */
  const layouts = () => fixture.messages.filter(message => message.event === 'layout.changed')
  return { fixture, frame, post, rect, layouts }
}

describe('runtime frame host work', () => {
  let frames: ReturnType<typeof animationFrames>
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      /** Tests trigger layout through window events instead. */
      observe = vi.fn()
      /** Fixture releases its observer on controller disposal. */
      disconnect = vi.fn()
    })
    frames = animationFrames()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('publishes layout only when mapped viewports change', async () => {
    const { fixture, rect, layouts } = await readyFrame()
    try {
      frames.flush()
      expect(layouts()).toHaveLength(1)
      window.dispatchEvent(new Event('resize'))
      frames.flush()
      window.dispatchEvent(new Event('resize'))
      frames.flush()
      expect(layouts()).toHaveLength(1)
      rect.mockReturnValue(new DOMRect(0, 40, 320, 240))
      window.dispatchEvent(new Event('resize'))
      frames.flush()
      expect(layouts()).toHaveLength(2)
      expect(layouts()[1].payload.viewports[0].y).toBe(40)
    }
    finally { await fixture.close() }
  })

  it('ignores scrolling inside elements that do not contain the frame', async () => {
    const { fixture } = await readyFrame()
    const list = document.createElement('div')
    document.body.append(list)
    try {
      frames.flush()
      list.dispatchEvent(new Event('scroll'))
      expect(frames.pending()).toBe(0)
      document.dispatchEvent(new Event('scroll'))
      expect(frames.pending()).toBe(1)
    }
    finally {
      list.remove()
      await fixture.close()
    }
  })

  it('syncs sandbox settings only when settings change', async () => {
    const { fixture, frame, post } = await readyFrame()
    /** Settings messages posted to the sandbox so far. */
    const settingsSyncs = () => post.mock.calls.filter(([message]) => message.type === PREVIEW_SETTINGS_SYNC)
    try {
      post.mockClear()
      // State publication replaces the session snapshot but leaves settings untouched.
      publishFrameMessage(frame, STATE_SYNC, undefined, { state: { count: 1 } })
      expect(fixture.session.getSnapshot().state?.value).toEqual({ count: 1 })
      expect(settingsSyncs()).toHaveLength(0)
      await fixture.session.settings.update({ checkerboard: !fixture.session.getSnapshot().settings.checkerboard })
      expect(settingsSyncs().length).toBeGreaterThan(0)
    }
    finally { await fixture.close() }
  })
})
