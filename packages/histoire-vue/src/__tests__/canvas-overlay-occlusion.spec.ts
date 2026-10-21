import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { canvasOverlayIsOccluded, canvasRectsOverlap } from '../../../histoire-app/src/app/components/canvas/canvas-overlay-occlusion.js'
import { useCanvasHeaderOcclusion } from '../../../histoire-app/src/app/components/canvas/useCanvasHeaderOcclusion.js'
import { createCanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { type CanvasArrangement, createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'

/** Header occlusion measures once per animation frame. */
function animationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

describe('canvas overlay occlusion', () => {
  const header = { left: 100, top: 80, right: 500, bottom: 130 }

  it('detects a rendered iframe behind canvas header information', () => {
    expect(canvasRectsOverlap(header, { left: 240, top: 100, right: 640, bottom: 300 })).toBe(true)
  })

  it('detects a variant label toolbar behind canvas header information', () => {
    expect(canvasOverlayIsOccluded(header, [
      { left: 240, top: 100, right: 640, bottom: 128 },
    ])).toBe(true)
  })

  it('keeps header information visible for adjacent or non-rendered bounds', () => {
    expect(canvasRectsOverlap(header, { left: 500, top: 100, right: 700, bottom: 300 })).toBe(false)
    expect(canvasRectsOverlap(header, { left: 240, top: 130, right: 640, bottom: 300 })).toBe(false)
  })

  it('keeps overlapping metadata visible in Matrix and restores occlusion after leaving it', async () => {
    const canvas = createCanvasStore()
    const registry = createCanvasFrames(canvas)
    const arrangement = ref<CanvasArrangement>('grid')
    const viewport = document.createElement('div')
    const heading = document.createElement('header')
    const label = document.createElement('span')
    label.dataset.canvasOverlayOccluder = ''
    viewport.append(heading, label)
    document.body.append(viewport)
    // Supply screen rectangles for the overlap algorithm; Vue ownership and watchers stay real.
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 400, 50))
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(new DOMRect(240, 100, 400, 28))
    const scope = effectScope()
    try {
      const obscured = scope.run(() => useCanvasHeaderOcclusion({
        header: () => heading,
        viewport: () => viewport,
        canvas,
        registry,
        bounds: () => null,
        enabled: () => arrangement.value !== 'matrix',
      }))!
      expect(obscured.value).toBe(true)
      arrangement.value = 'matrix'
      await nextTick()
      expect(obscured.value).toBe(false)
      canvas.panOffset.y += 100
      await nextTick()
      expect(obscured.value).toBe(false)
      arrangement.value = 'list'
      await nextTick()
      await animationFrame()
      expect(obscured.value).toBe(true)
      label.remove()
      canvas.panOffset.y += 100
      await nextTick()
      await animationFrame()
      expect(obscured.value).toBe(false)
    }
    finally {
      scope.stop()
      viewport.remove()
      vi.restoreAllMocks()
    }
  })

  it('coalesces camera changes into one geometry read per animation frame', async () => {
    const canvas = createCanvasStore()
    const registry = createCanvasFrames(canvas)
    const heading = document.createElement('header')
    document.body.append(heading)
    const read = vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 400, 50))
    const scope = effectScope()
    try {
      scope.run(() => useCanvasHeaderOcclusion({ header: () => heading, viewport: () => undefined, canvas, registry, bounds: () => null }))
      read.mockClear()
      for (let step = 0; step < 5; step++) {
        canvas.panOffset.x += 10
        await nextTick()
      }
      expect(read).not.toHaveBeenCalled()
      await animationFrame()
      expect(read).toHaveBeenCalledOnce()
    }
    finally {
      scope.stop()
      heading.remove()
      vi.restoreAllMocks()
    }
  })
})
