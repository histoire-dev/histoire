import { describe, expect, it } from 'vitest'
import { centeredView, fitView, keyCommand, zoomAt } from '../workbench/image/pan-zoom.js'

describe('image pan and zoom', () => {
  it('fits large images and never upscales small ones', () => {
    expect(fitView({ width: 400, height: 300 }, { width: 800, height: 300 })).toEqual({ scale: 0.5, x: 0, y: 75 })
    expect(fitView({ width: 400, height: 300 }, { width: 100, height: 100 })).toEqual({ scale: 1, x: 150, y: 100 })
  })

  it('shifts the fitted image by the offset', () => {
    expect(fitView({ width: 400, height: 300 }, { width: 800, height: 300 }, [10, -20])).toEqual({ scale: 0.5, x: 10, y: 55 })
  })

  it('centers an explicit scale and applies the offset', () => {
    expect(centeredView({ width: 400, height: 300 }, { width: 100, height: 100 }, 2, [10, -20])).toEqual({ scale: 2, x: 110, y: 30 })
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const view = zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 })
    expect(view).toEqual({ scale: 2, x: -100, y: -50 })
    // Image point under the cursor: (100 - x) / scale stays 100.
    expect((100 - view.x) / view.scale).toBe(100)
    expect(zoomAt({ scale: 10, x: 0, y: 0 }, 10, { x: 0, y: 0 }).scale).toBe(16)
  })

  it('maps keyboard shortcuts to view commands', () => {
    // Arrows reveal the side they point to, so the image moves the opposite way.
    expect(keyCommand({ key: 'ArrowRight', shiftKey: false })).toEqual({ pan: [-40, 0] })
    expect(keyCommand({ key: 'ArrowUp', shiftKey: true })).toEqual({ pan: [0, 200] })
    expect(keyCommand({ key: '+', shiftKey: true })).toEqual({ zoom: 1.25 })
    expect(keyCommand({ key: '=', shiftKey: false })).toEqual({ zoom: 1.25 })
    expect(keyCommand({ key: '-', shiftKey: false })).toEqual({ zoom: 0.8 })
    expect(keyCommand({ key: '0', shiftKey: false })).toBe('fit')
    expect(keyCommand({ key: 'a', shiftKey: false })).toBeUndefined()
    // Browser shortcuts such as Ctrl + and Ctrl 0 stay untouched.
    expect(keyCommand({ key: '+', shiftKey: false, ctrlKey: true })).toBeUndefined()
    expect(keyCommand({ key: '0', shiftKey: false, metaKey: true })).toBeUndefined()
  })
})
