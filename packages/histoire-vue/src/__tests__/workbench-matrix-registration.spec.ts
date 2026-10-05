import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createCanvasPropsRequestId } from '../../../histoire-app/src/app/components/canvas/frame-requests.js'
import { watchMatrixFrameRegistration } from '../../../histoire-app/src/app/components/canvas/matrix/matrix-registration.js'
import { createCanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { matrixCellKey } from '../../../histoire-app/src/app/util/matrix.js'

describe('matrix preview request ownership', () => {
  it('updates exact base target but preserves attachment on geometry-only changes', () => {
    const registry = createCanvasFrames(createCanvasStore())
    const frame = shallowRef({ id: 'cell', storyId: 'story', variantId: 'first', x: 0, y: 0, width: 720, height: 640 })
    const variant = shallowRef('first')
    const overrides = shallowRef({ enabled: true })
    const retired = vi.fn()
    const stop = watchMatrixFrameRegistration({ registry, getFrame: () => frame.value, getVariantId: () => variant.value, getPropsOverride: () => overrides.value, onTargetChange: retired })
    const first = registry.getFrame('cell')!
    first.iframe = document.createElement('iframe')
    first.documentId = 'first-document'
    frame.value = { ...frame.value, x: 25 }
    expect(registry.getFrame('cell')).toBe(first)
    expect(first.documentId).toBe('first-document')
    expect(first.rect.x).toBe(25)
    expect(retired).toHaveBeenCalledTimes(1)
    expect(first.propsOverride).toEqual({ enabled: true })
    overrides.value = { enabled: false }
    expect(first.propsOverride).toEqual({ enabled: false })
    variant.value = 'alternate'
    expect(registry.getFrame('cell')).toMatchObject({ variantId: 'alternate' })
    expect(registry.getFrame('cell')?.documentId).toBeUndefined()
    expect(retired).toHaveBeenCalledTimes(2)
    const successor = registry.registerFrame({ ...frame.value, variantId: 'successor' })
    stop()
    expect(registry.getFrame('cell')?.variantId).toBe('successor')
    successor()
  })

  it('keeps correlation IDs short while arbitrary cell keys retain distinct identities', () => {
    const longValue = 'x'.repeat(500)
    const firstKey = matrixCellKey('story', 'label', longValue, 'enabled', false)
    const secondKey = matrixCellKey('story', 'label', `${longValue}y`, 'enabled', false)
    expect(firstKey.length).toBeGreaterThan(200)
    expect(firstKey).not.toBe(secondKey)
    const firstRequests = createCanvasPropsRequestId()
    const secondRequests = createCanvasPropsRequestId()
    const ids = [firstRequests(), firstRequests(), secondRequests()]
    expect(new Set(ids).size).toBe(3)
    expect(ids.every(id => id.length <= 200)).toBe(true)
  })

  it('creates distinct passive request owners on plain HTTP without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {})
    try {
      const first = createCanvasPropsRequestId()()
      const second = createCanvasPropsRequestId()()
      expect(first).not.toBe(second)
      expect(first.length).toBeLessThanOrEqual(200)
      expect(second.length).toBeLessThanOrEqual(200)
    }
    finally { vi.unstubAllGlobals() }
  })
})
