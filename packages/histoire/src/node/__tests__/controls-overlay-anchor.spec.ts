import { describe, expect, it } from 'vitest'
import { getControlsOverlayAnchor } from '../../../../histoire-app/src/app/util/controls-overlay-anchor.js'

describe('controls overlay anchors', () => {
  const frame = { x: 500, y: -50, width: 300, height: 900 }
  const viewport = { x: 0, y: 0, width: 1200, height: 800 }
  const panel = { x: 500, y: 100, width: 300, height: 500 }

  it('translates iframe coordinates and follows panel scroll', () => {
    const anchor = { x: 120, y: 200, width: 150, height: 27 }
    expect(getControlsOverlayAnchor(anchor, frame, [viewport, panel])).toEqual({ x: 620, y: 150, width: 150, height: 27 })
    expect(getControlsOverlayAnchor(anchor, { ...frame, y: -100 }, [viewport, panel])?.y).toBe(100)
  })

  it('closes anchors scrolled outside the panel or resized outside the viewport', () => {
    expect(getControlsOverlayAnchor({ x: 0, y: 100, width: 150, height: 27 }, frame, [viewport, panel])).toBeNull()
    expect(getControlsOverlayAnchor({ x: 800, y: 200, width: 150, height: 27 }, frame, [viewport, panel])).toBeNull()
    expect(getControlsOverlayAnchor({ x: 0, y: Number.NaN, width: 150, height: 27 }, frame, [viewport, panel])).toBeNull()
    expect(getControlsOverlayAnchor({ x: 0, y: 200, width: 0, height: 0 }, frame, [viewport, panel])).toBeNull()
  })
})
