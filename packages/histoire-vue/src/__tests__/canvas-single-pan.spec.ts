import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { bindCanvasFrameInteractions } from '../../../histoire-app/src/app/components/canvas/frame-interactions.js'
import { useCanvasPan } from '../../../histoire-app/src/app/components/canvas/useCanvasPan.js'
import { useSingleVariantPan } from '../../../histoire-app/src/app/components/canvas/useSingleVariantPan.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

/** Mount real gesture owners over controlled native scroll geometry. */
async function panFixture(width = 1600, height = 1000) {
  const observer = resizeObserverFixture()
  const canvas = createCanvasStore()
  canvas.setArrangement('single')
  const state = reactive({ width, height, zoom: 1, visibleWidth: 800, visibleHeight: 600, resizing: false, frameId: 'first', arrangement: 'single' as 'single' | 'grid' })
  const surface = ref<HTMLElement>()
  let single!: ReturnType<typeof useSingleVariantPan>
  let gestures!: ReturnType<typeof useCanvasPan>
  const wrapper = mount(defineComponent({
    setup() {
      single = useSingleVariantPan(surface, {
        size: () => state.frameId ? state : undefined,
        zoom: () => state.zoom,
        area: () => ({ x: 16, y: 136, width: state.visibleWidth, height: state.visibleHeight }),
        resizing: () => state.resizing,
      })
      gestures = useCanvasPan({ canvas, viewport: () => surface.value, arrangement: () => state.arrangement, frameId: () => state.frameId, single: () => ({ canPan: single.canPan.value, getOffset: single.getOffset, setOffset: single.setOffset }) })
      return () => h('div', { ref: surface }, h('iframe'))
    },
  }), { attachTo: document.body })
  const element = surface.value!
  Object.defineProperties(element, {
    clientWidth: { get: () => state.visibleWidth },
    clientHeight: { get: () => state.visibleHeight },
    // Resize grips can enlarge DOM scroll extents; adapter must ignore them.
    scrollWidth: { get: () => state.width * state.zoom + 6 },
    scrollHeight: { get: () => state.height * state.zoom + 6 },
  })
  const target = { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() }
  /** Feed client-pixel positions directly into shared pointer controller. */
  function pointer(type: 'down' | 'move' | 'up', x: number, y: number, button = 0) {
    const event = { pointerId: 7, button, clientX: x, clientY: y, currentTarget: target, preventDefault: vi.fn() } as unknown as PointerEvent
    return gestures.pointer[type === 'down' ? 'onPointerDown' : type === 'move' ? 'onPointerMove' : 'onPointerUp'](event)
  }
  await nextTick()
  observer.deliver()
  return { canvas, state, single, gestures, element, wrapper, observer, pointer, target }
}

afterEach(() => vi.unstubAllGlobals())

describe('bounded single variant pan', () => {
  it.each([
    [300, 300, false],
    [800, 600, false],
    [1000, 300, true],
    [300, 1000, true],
    [1000, 1000, true],
  ])('admits overflow for %s × %s: %s', async (width, height, enabled) => {
    const test = await panFixture(width, height)
    try {
      expect(test.single.canPan.value).toBe(enabled)
    }
    finally { test.wrapper.unmount() }
  })

  it.each([
    { tool: 'pan', space: false, button: 0 },
    { tool: 'select', space: true, button: 0 },
    { tool: 'select', space: false, button: 1 },
  ])('clamps $tool / Space=$space / button=$button and reverses immediately', async ({ tool, space, button }) => {
    const test = await panFixture()
    const offset = { ...test.canvas.panOffset }
    try {
      test.canvas.tool = tool as 'pan' | 'select'
      test.gestures.space.held.value = space
      expect(test.pointer('down', 0, 0, button)).toBe(true)
      test.pointer('move', -2000, -2000, button)
      expect(test.single.getOffset()).toEqual({ x: -800, y: -400 })
      test.pointer('move', -1990, -1980, button)
      expect(test.single.getOffset()).toEqual({ x: -790, y: -380 })
      test.pointer('move', 2000, 2000, button)
      expect(test.element.scrollLeft).toBe(0)
      expect(test.element.scrollTop).toBe(0)
      test.pointer('up', 2000, 2000, button)
      expect(test.canvas.panning).toBe(false)
      expect(test.canvas.panOffset).toEqual(offset)
    }
    finally { test.wrapper.unmount() }
  })

  it.each([[1200, 300, 400, 0], [300, 1000, 0, 400]])('locks fitting axis for %s × %s', async (width, height, x, y) => {
    const test = await panFixture(width, height)
    try {
      test.single.setOffset({ x: -5000, y: -5000 })
      expect(test.element.scrollLeft).toBe(x)
      expect(test.element.scrollTop).toBe(y)
    }
    finally { test.wrapper.unmount() }
  })

  it('reads native scrolling before dragging and preserves Select input', async () => {
    const test = await panFixture()
    try {
      expect(test.pointer('down', 0, 0)).toBe(false)
      test.element.scrollLeft = 200
      test.element.scrollTop = 100
      test.pointer('down', 0, 0, 1)
      test.pointer('move', 20, 30, 1)
      expect(test.single.getOffset()).toEqual({ x: -180, y: -70 })
    }
    finally { test.wrapper.unmount() }
  })

  it.each(['zoom', 'area', 'size', 'frame', 'arrangement', 'resize'] as const)('releases capture and Space on %s change', async (change) => {
    const test = await panFixture()
    try {
      test.gestures.space.held.value = true
      test.pointer('down', 0, 0)
      test.pointer('move', -100, -100)
      if (change === 'zoom') test.state.zoom = 0.25
      if (change === 'area') {
        test.state.visibleWidth = 2000
        test.state.visibleHeight = 1200
      }
      if (change === 'size') {
        test.state.width = 300
        test.state.height = 300
      }
      if (change === 'frame') test.state.frameId = 'second'
      if (change === 'arrangement') test.state.arrangement = 'grid'
      if (change === 'resize') test.state.resizing = true
      await nextTick()
      test.observer.deliver()
      expect(test.canvas.panning).toBe(false)
      expect(test.gestures.space.held.value).toBe(false)
      expect(test.target.releasePointerCapture).toHaveBeenCalledWith(7)
      if (change === 'zoom' || change === 'area' || change === 'size') {
        expect(test.element.scrollLeft).toBe(0)
        expect(test.element.scrollTop).toBe(0)
      }
      if (change === 'resize') expect(test.pointer('down', 0, 0, 1)).toBe(false)
    }
    finally { test.wrapper.unmount() }
  })

  it('admits minimum Fit overflow and rejects an absent selected frame', async () => {
    const test = await panFixture(16384, 16384)
    try {
      test.canvas.setSingleGeometry({ width: 800, height: 600 }, test.state)
      test.canvas.fit()
      test.state.zoom = test.canvas.effectiveZoom
      await nextTick()
      expect(test.canvas.effectiveZoom).toBe(0.1)
      expect(test.single.canPan.value).toBe(true)
      test.state.frameId = ''
      expect(test.single.canPan.value).toBe(false)
    }
    finally { test.wrapper.unmount() }
  })

  it('clamps surviving overflow on observer delivery and retires observer on unmount', async () => {
    const test = await panFixture()
    test.single.setOffset({ x: -800, y: -400 })
    test.state.visibleWidth = 1400
    test.state.visibleHeight = 900
    test.observer.deliver()
    expect(test.single.getOffset()).toEqual({ x: -200, y: -100 })
    test.pointer('down', 0, 0, 1)
    test.wrapper.unmount()
    expect(test.canvas.panning).toBe(false)
    expect(test.target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(test.observer.count()).toBe(0)
  })

  it('routes scaled iframe gestures to native scrolling and keeps other arrangements on store offsets', async () => {
    const test = await panFixture()
    const iframe = test.element.firstElementChild as HTMLIFrameElement
    Object.defineProperties(iframe, { clientWidth: { value: 800 }, clientHeight: { value: 500 } })
    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 1600, height: 1000 } as DOMRect)
    const close = bindCanvasFrameInteractions(test.element, test.gestures.pointer, test.gestures.space, () => {})
    try {
      const document = iframe.contentDocument!
      for (const [type, x, y] of [['pointerdown', 100, 100], ['pointermove', 50, 75], ['pointerup', 50, 75]] as const) {
        const event = new MouseEvent(type, { clientX: x, clientY: y, button: 1, cancelable: true })
        Object.defineProperty(event, 'pointerId', { value: 8 })
        document.dispatchEvent(event)
      }
      expect(test.single.getOffset()).toEqual({ x: -100, y: -50 })
      test.state.arrangement = 'grid'
      test.canvas.setArrangement('grid')
      const offset = { ...test.canvas.panOffset }
      test.pointer('down', 0, 0, 1)
      test.pointer('move', 20, 30, 1)
      expect(test.canvas.panOffset).toEqual({ x: offset.x + 20, y: offset.y + 30 })
      expect(test.single.getOffset()).toEqual({ x: -100, y: -50 })
    }
    finally {
      close()
      test.wrapper.unmount()
    }
  })
})
