// @vitest-environment jsdom
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewAppRoot } from '../virtual/preview-runtime/app-root.js'

describe('controls intrinsic sizing', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reports shrinking form height without measuring viewport or floating content', () => {
    let resize: () => void
    const observe = vi.fn()
    const post = vi.fn()
    /** Captures the generated runtime observer without relying on jsdom layout. */
    class ControlsResizeObserver {
      /** Installs the content measurement callback. */
      constructor(callback: () => void) { resize = callback }
      /** Records the in-flow root being observed. */
      observe = observe
    }
    const runtime = runInNewContext(`${previewAppRoot()}; ({ root, observeControlsResize })`, {
      document,
      ResizeObserver: ControlsResizeObserver,
      postToParent: post,
      CONTROLS_RESIZE: 'resize',
      initialSelection: { controls: false },
    })
    const measure = vi.spyOn(runtime.root, 'getBoundingClientRect').mockReturnValue({ height: 180.5 })
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 800 })
    runtime.observeControlsResize()
    expect(observe).toHaveBeenCalledWith(runtime.root)
    expect(post).toHaveBeenLastCalledWith({ type: 'resize', height: 181 })
    measure.mockReturnValue({ height: 60 })
    resize!()
    expect(post).toHaveBeenLastCalledWith({ type: 'resize', height: 60 })
  })
})
