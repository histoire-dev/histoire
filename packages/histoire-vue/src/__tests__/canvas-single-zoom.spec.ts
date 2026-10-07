import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useSingleVariantZoom } from '../../../histoire-app/src/app/components/canvas/useSingleVariantZoom.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'

/** Native scroll fixture models frame centering and DOM updates separately from store scale. */
function scrollFixture(width = 1600, height = 1000) {
  const canvas = createCanvasStore()
  canvas.setArrangement('single')
  canvas.setSingleGeometry({ width: 800, height: 600 }, { width, height })
  const frameId = ref('first')
  const surface = ref<HTMLElement>()
  const wrapper = mount(defineComponent({
    setup() {
      useSingleVariantZoom(canvas, surface, {
        area: () => ({ x: 16, y: 136, width: 800, height: 600 }),
        size: () => ({ width, height }),
        frameId: () => frameId.value,
      })
      return () => h('div', { ref: surface }, [h('div', { class: 'histoire-canvas-frame', style: { width: `${width * canvas.effectiveZoom}px` } })])
    },
  }), { attachTo: document.body })
  const element = surface.value!
  Object.defineProperties(element, { clientWidth: { value: 800 }, clientHeight: { value: 600 } })
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({ left: 100, top: 50, width: 800, height: 600 }) as DOMRect)
  const frame = element.firstElementChild as HTMLElement
  vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(() => {
    const displayedWidth = Number.parseFloat(frame.style.width)
    return { left: 100 + Math.max(0, (800 - displayedWidth) / 2) - element.scrollLeft, top: 50 - element.scrollTop, width: displayedWidth, height: height * displayedWidth / width } as DOMRect
  })
  return { canvas, frameId, element, wrapper }
}

describe('single native zoom anchoring', () => {
  it('keeps cursor document point fixed through batched wheel zooms and resets scroll on Fit', async () => {
    const test = scrollFixture()
    try {
      await nextTick()
      test.canvas.setZoom(0.75, { x: 216, y: 336 })
      test.canvas.setZoom(1, { x: 216, y: 336 })
      await nextTick()
      expect(test.element.scrollLeft).toBe(200)
      expect(test.element.scrollTop).toBe(200)
      test.canvas.setZoom(2, { x: 216, y: 336 })
      await nextTick()
      expect(test.element.scrollLeft).toBe(600)
      expect(test.element.scrollTop).toBe(600)
      test.canvas.fit()
      await nextTick()
      expect(test.element.scrollLeft).toBe(0)
      expect(test.element.scrollTop).toBe(0)
    }
    finally { test.wrapper.unmount() }
  })

  it('accounts for centered frames when toolbar zoom uses visible canvas center', async () => {
    const test = scrollFixture(300, 300)
    try {
      await nextTick()
      test.canvas.setZoom(4)
      await nextTick()
      expect(test.element.scrollLeft).toBe(200)
      expect(test.element.scrollTop).toBe(900)
    }
    finally { test.wrapper.unmount() }
  })

  it('retires pending scroll adjustments when variant changes or surface unmounts', async () => {
    const test = scrollFixture()
    await nextTick()
    test.canvas.setZoom(1, { x: 216, y: 336 })
    test.frameId.value = 'second'
    await nextTick()
    expect(test.element.scrollLeft).toBe(0)
    expect(test.element.scrollTop).toBe(0)
    test.canvas.setZoom(2, { x: 216, y: 336 })
    test.wrapper.unmount()
    await nextTick()
    expect(test.element.scrollLeft).toBe(0)
    expect(test.element.scrollTop).toBe(0)
  })
})
