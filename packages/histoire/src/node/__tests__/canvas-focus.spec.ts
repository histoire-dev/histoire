import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { watchCanvasFrameFocus } from '../../../../histoire-app/src/app/components/canvas/frame-focus.js'
import { canvasFrameBounds, layoutCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { canvasToClient, clientToCanvas } from '../../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'

describe('canvas selection focus binding', () => {
  it('preserves cursor zoom anchor across reactive layout updates, focusing only identity changes', async () => {
    const canvas = createCanvasStore()
    const selectedId = ref('first')
    const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
    const frames = computed(() => layoutCanvasFrames('story', ['first', 'second', 'third'], { width: 720, height: 640 }, arrange.value === 'list' ? 'list' : 'grid', 3, canvas.effectiveZoom))
    const selected = computed(() => frames.value.find(frame => frame.variantId === selectedId.value))
    canvas.setGeometry({ width: 1200, height: 900 }, canvasFrameBounds(frames.value), 380)
    const focusFrame = vi.fn(canvas.focusFrame)
    const registerPrimary = vi.fn()
    const stop = watchCanvasFrameFocus({ getFrame: () => selected.value, getArrange: () => arrange.value, focusFrame, registerPrimary })
    try {
      const cursor = { x: 600, y: 450 }
      const worldPoint = clientToCanvas(cursor, canvas.effectiveZoom, canvas.panOffset)
      canvas.setZoom(1, cursor)
      await nextTick()
      expect(canvasToClient(worldPoint, canvas.effectiveZoom, canvas.panOffset)).toEqual(cursor)
      expect(focusFrame).not.toHaveBeenCalled()
      selectedId.value = 'second'
      await nextTick()
      expect(focusFrame).toHaveBeenCalledTimes(1)
      expect(canvas.selectedFrame).toBe(selected.value!.id)
      arrange.value = 'matrix'
      await nextTick()
      expect(focusFrame).toHaveBeenCalledTimes(1)
      arrange.value = 'list'
      await nextTick()
      expect(focusFrame).toHaveBeenCalledTimes(2)
      expect(registerPrimary).toHaveBeenCalledTimes(3)
    }
    finally { stop() }
  })
})
