import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { watchCanvasFrameFocus } from '../../../../histoire-app/src/app/components/canvas/frame-focus.js'
import { canvasFrameBounds, layoutCanvasFrames } from '../../../../histoire-app/src/app/components/canvas/frame-layout.js'
import { canvasToClient, clientToCanvas } from '../../../../histoire-app/src/app/components/canvas/pan/usePanZoom.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'

describe('canvas selection focus binding', () => {
  it('selects iframe-activated frames without revealing them', async () => {
    const frames = layoutCanvasFrames('story', ['first', 'second'], { width: 720, height: 640 }, 'grid')
    const current = ref(frames[0])
    const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
    const activatedFrameId = ref<string>()
    const canvas = createCanvasStore()
    canvas.setGeometry({ width: 320, height: 240 }, canvasFrameBounds(frames), 0)
    canvas.setZoom(1)
    canvas.setPanOffset({ x: 0, y: 0 })
    const initialOffset = { ...canvas.panOffset }
    const focusFrame = vi.fn(canvas.focusFrame)
    const selectFrame = vi.fn(canvas.selectFrame)
    const stop = watchCanvasFrameFocus({
      getFrame: () => current.value,
      getArrange: () => arrange.value,
      focusFrame,
      selectFrame,
      shouldRevealFrame: frame => frame.id !== activatedFrameId.value,
    })

    try {
      activatedFrameId.value = frames[1].id
      current.value = frames[1]
      await nextTick()
      expect(selectFrame).toHaveBeenCalledExactlyOnceWith(frames[1])
      expect(canvas.selectedFrame).toBe(frames[1].id)
      expect(canvas.panOffset).toEqual(initialOffset)
      expect(focusFrame).not.toHaveBeenCalled()

      activatedFrameId.value = undefined
      current.value = frames[0]
      await nextTick()
      expect(focusFrame).toHaveBeenCalledExactlyOnceWith(frames[0])
      expect(canvas.panOffset).not.toEqual(initialOffset)
    }
    finally { stop() }
  })

  it('reveals selection across arrangements without changing zoom', async () => {
    const canvas = createCanvasStore()
    const selectedId = ref('first')
    const arrange = ref<'grid' | 'list' | 'matrix'>('grid')
    const frames = computed(() => layoutCanvasFrames('story', ['first', 'second', 'third'], { width: 720, height: 640 }, arrange.value === 'list' ? 'list' : 'grid', 3, canvas.effectiveZoom))
    const selected = computed(() => frames.value.find(frame => frame.variantId === selectedId.value))
    canvas.setGeometry({ width: 1200, height: 900 }, canvasFrameBounds(frames.value), 380)
    const focusFrame = vi.fn(canvas.focusFrame)
    const stop = watchCanvasFrameFocus({ getFrame: () => selected.value, getArrange: () => arrange.value, focusFrame, selectFrame: canvas.selectFrame })
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
      expect(canvas.zoom).toBe(1)
      arrange.value = 'list'
      await nextTick()
      expect(focusFrame).toHaveBeenCalledTimes(2)
      expect(canvas.zoom).toBe(1)
      expect(canvas.zoom).toBe(canvas.effectiveZoom)
      selectedId.value = 'third'
      await nextTick()
      expect(focusFrame).toHaveBeenCalledTimes(3)
      expect(canvas.zoom).toBe(1)
    }
    finally { stop() }
  })
})
