import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useCanvasGeometry } from '../../../histoire-app/src/app/components/canvas/useCanvasGeometry.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

afterEach(() => vi.unstubAllGlobals())

it('publishes resize bursts after observer delivery and cancels retired geometry work', () => {
  const observers = resizeObserverFixture()
  const scheduled = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    scheduled.set(++nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduled.delete(id))
  const measure = vi.fn()
  const wrapper = mount(defineComponent({
    setup() {
      const viewport = ref<HTMLElement>()
      useCanvasGeometry({ viewport: () => viewport.value, toolbar: () => undefined, header: () => undefined, footer: () => undefined, temporaryPan: () => false, onMeasure: measure })
      return () => h('div', { ref: viewport })
    },
  }))
  measure.mockClear()
  observers.deliver()
  observers.deliver()
  expect(measure).not.toHaveBeenCalled()
  expect(scheduled.size).toBe(1)
  const callback = [...scheduled.values()][0]
  scheduled.clear()
  callback(0)
  expect(measure).toHaveBeenCalledOnce()
  observers.deliver()
  const retired = [...scheduled.values()][0]
  wrapper.unmount()
  expect(scheduled.size).toBe(0)
  retired(0)
  expect(measure).toHaveBeenCalledOnce()
  expect(observers.count()).toBe(0)
})
