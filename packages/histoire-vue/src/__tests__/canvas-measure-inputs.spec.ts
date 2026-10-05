import { getHistoireTargetKey, VARIANT_READY } from '@histoire/protocol'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import MeasureOverlay from '../../../histoire-app/src/app/components/canvas/MeasureOverlay.vue'
import { usePointerPan } from '../../../histoire-app/src/app/components/canvas/pan/usePointerPan.js'
import { createCanvasFrames, provideCanvas, provideCanvasPointerPan } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { MEASURE_REQUEST, MEASURE_RESULT } from '../../../histoire-shared/src/types/preview-message.js'
import { createRuntimeFrameFixture, publishFrameMessage } from '../../../histoire/src/node/__tests__/utils/embed/runtime-frame.js'
import { measureResult } from '../../../histoire/src/node/__tests__/utils/measurement.js'

/** Dispatch pointer-like input in JSDOM while preserving native currentTarget ownership. */
function pointer(type: string, values: { pointerId: number, button: number, clientX: number, clientY: number }): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])))
  return event
}

/** Real preview owner supplies measured document and shared pointer-pan path. */
async function measureFixture(held = false) {
  vi.stubGlobal('ResizeObserver', class {
    /** Runtime fixture observes physical preview geometry only. */
    observe = vi.fn()
    /** Test teardown owns observer lifecycle. */
    disconnect = vi.fn()
  })
  const fixture = await createRuntimeFrameFixture({ standalone: true, sourceBase: new URL('/book/', window.location.href).href })
  const iframe = fixture.container.querySelector('iframe')!
  publishFrameMessage(iframe, VARIANT_READY)
  await fixture.primary.ready
  const canvas = createCanvasStore()
  canvas.setTool('measure')
  canvas.panOffset = { x: 0, y: 0 }
  const frames = createCanvasFrames(canvas)
  const frameKey = getHistoireTargetKey({ storyId: 'a:b', variantId: 'c' })
  frames.registerFrame({ id: frameKey, storyId: 'a:b', variantId: 'c', rect: { x: 0, y: 0, width: 720, height: 640 }, iframe, documentId: new URL(iframe.src).searchParams.get('documentId'), session: fixture.session })
  canvas.selectedFrame = frameKey
  const heldSpace = ref(held)
  const pan = usePointerPan({ getTool: () => canvas.tool, getSpace: () => heldSpace.value, getOffset: () => canvas.panOffset, setOffset: value => canvas.panOffset = value, onActive: value => canvas.panning = value })
  const rect = { x: 10, y: 20, width: 720, height: 640, top: 20, left: 10, right: 730, bottom: 660, toJSON: () => ({}) }
  vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(rect)
  const Host = defineComponent({
    setup() {
      provideCanvas(canvas, frames)
      provideCanvasPointerPan(pan)
      return () => h(MeasureOverlay)
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session: fixture.session }, attachTo: document.body, slots: { default: () => h(Host) } })
  await nextTick()
  return { fixture, wrapper, canvas, frames, iframe, heldSpace, pan,
    /** Retire overlay before disposing its runtime document. */
    async close() {
      wrapper.unmount()
      await fixture.close()
    } }
}

describe('measurement hit input', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    { name: 'middle mouse', button: 1, held: false },
    { name: 'held Space', button: 0, held: true },
  ])('relays $name gestures through shared pointer pan with correct click ownership', async ({ button, held }) => {
    const test = await measureFixture(held)
    const { canvas, heldSpace } = test
    try {
      await nextTick()
      const hit = document.querySelector<HTMLElement>('.histoire-measure-hit')!
      const capture = vi.fn()
      const release = vi.fn()
      Object.assign(hit, { setPointerCapture: capture, hasPointerCapture: () => true, releasePointerCapture: release })
      hit.dispatchEvent(pointer('pointerdown', { pointerId: 7, button, clientX: 60, clientY: 70 }))
      hit.dispatchEvent(pointer('pointermove', { pointerId: 7, button, clientX: 104, clientY: 118 }))
      hit.dispatchEvent(pointer('pointerup', { pointerId: 7, button, clientX: 104, clientY: 118 }))
      expect(canvas.panOffset).toEqual({ x: 44, y: 48 })
      expect(canvas.tool).toBe('measure')
      expect(capture).toHaveBeenCalledWith(7)
      expect(release).toHaveBeenCalledWith(7)
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 104, clientY: 118 }))
      await nextTick()
      expect(hit.getAttribute('aria-label')).toBe(button === 0 ? 'Lock measurement' : 'Unlock measurement')
      if (button === 0) {
        hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 104, clientY: 118 }))
        await nextTick()
        expect(hit.getAttribute('aria-label')).toBe('Unlock measurement')
      }
      hit.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
      await nextTick()
      expect(hit.getAttribute('aria-label')).toBe('Lock measurement')
      hit.dispatchEvent(pointer('pointerdown', { pointerId: 8, button, clientX: 10, clientY: 10 }))
      hit.dispatchEvent(pointer('pointercancel', { pointerId: 8, button, clientX: 10, clientY: 10 }))
      expect(canvas.panning).toBe(false)
      if (button === 0) {
        hit.dispatchEvent(pointer('pointerdown', { pointerId: 9, button: 0, clientX: 10, clientY: 10 }))
        hit.dispatchEvent(pointer('pointerup', { pointerId: 9, button: 0, clientX: 20, clientY: 20 }))
        heldSpace.value = false
        hit.dispatchEvent(pointer('pointerdown', { pointerId: 10, button: 0, clientX: 20, clientY: 20 }))
        hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }))
        await nextTick()
        expect(hit.getAttribute('aria-label')).toBe('Unlock measurement')
      }
    }
    finally {
      await test.close()
    }
  })

  it('retires queued hover, locked geometry and late replies when leaving Measure', async () => {
    const test = await measureFixture()
    const scheduled = new Map<number, FrameRequestCallback>()
    let nextId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled.set(++nextId, callback)
      return nextId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduled.delete(id))
    const post = vi.spyOn(test.iframe.contentWindow!, 'postMessage')
    try {
      let hit = document.querySelector<HTMLElement>('.histoire-measure-hit')!
      hit.dispatchEvent(pointer('pointermove', { pointerId: 1, button: 0, clientX: 60, clientY: 70 }))
      expect(scheduled.size).toBe(1)
      const retiredHover = [...scheduled.values()][0]
      test.canvas.setTool('select')
      expect(scheduled.size).toBe(0)
      retiredHover(0)
      expect(post).not.toHaveBeenCalled()
      await nextTick()
      expect(document.querySelector('.histoire-measure-hit')).toBeNull()

      test.canvas.setTool('measure')
      await nextTick()
      hit = document.querySelector<HTMLElement>('.histoire-measure-hit')!
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 70 }))
      const request = post.mock.calls.at(-1)![0]
      expect(request).toMatchObject({ type: MEASURE_REQUEST, x: 50, y: 50 })
      publishFrameMessage(test.iframe, MEASURE_RESULT, undefined, { requestId: request.requestId, result: measureResult() })
      await nextTick()
      expect(document.querySelector('.histoire-measure-box')?.getAttribute('data-locked')).toBe('true')

      hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await nextTick()
      expect(hit.getAttribute('aria-pressed')).toBe('false')
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 70 }))
      await nextTick()
      expect(hit.getAttribute('aria-pressed')).toBe('true')
      test.canvas.setTool('pan')
      await nextTick()
      expect(document.querySelector('.histoire-measure-box')).toBeNull()
      test.canvas.setTool('measure')
      await nextTick()
      hit = document.querySelector<HTMLElement>('.histoire-measure-hit')!
      expect(hit.getAttribute('aria-pressed')).toBe('false')

      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 80, clientY: 90 }))
      const pending = post.mock.calls.at(-1)![0]
      test.canvas.setTool('select')
      test.canvas.setTool('measure')
      publishFrameMessage(test.iframe, MEASURE_RESULT, undefined, { requestId: pending.requestId, result: measureResult() })
      await nextTick()
      expect(document.querySelector('.histoire-measure-box')).toBeNull()
      expect(document.querySelector('.histoire-measure-hit')?.getAttribute('aria-pressed')).toBe('false')
    }
    finally { await test.close() }
  })

  it('releases measurement-owned pan capture before tool change removes hit surface', async () => {
    const test = await measureFixture()
    try {
      const hit = document.querySelector<HTMLElement>('.histoire-measure-hit')!
      const release = vi.fn()
      Object.assign(hit, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: release })
      hit.dispatchEvent(pointer('pointerdown', { pointerId: 7, button: 1, clientX: 60, clientY: 70 }))
      expect(test.canvas.panning).toBe(true)
      test.fixture.source.emitCatalog()
      expect(test.canvas.panning).toBe(true)
      test.canvas.setTool('select')
      expect(test.canvas.panning).toBe(false)
      expect(release).toHaveBeenCalledExactlyOnceWith(7)
      await nextTick()
      expect(document.querySelector('.histoire-measure-hit')).toBeNull()
      test.canvas.setTool('measure')
      await nextTick()
      document.querySelector<HTMLElement>('.histoire-measure-hit')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 70 }))
      await nextTick()
      expect(document.querySelector('.histoire-measure-hit')?.getAttribute('aria-pressed')).toBe('true')
    }
    finally { await test.close() }
  })
})
