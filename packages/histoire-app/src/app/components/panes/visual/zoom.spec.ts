import { describe, expect, it } from 'vitest'
import { fitVisualZoom } from './zoom.js'

describe('fitVisualZoom', () => {
  it('enlarges small images to fill pane when enlarging is allowed', () => {
    expect(fitVisualZoom({ width: 2048, height: 1600 }, [{ width: 1024, height: 640 }], true)).toBe(2)
  })

  it('keeps small images at natural size for automatic sizing', () => {
    expect(fitVisualZoom({ width: 2048, height: 1600 }, [{ width: 1024, height: 640 }], false)).toBe(1)
  })

  it('shrinks to tightest axis across all compared images', () => {
    expect(fitVisualZoom({ width: 512, height: 1000 }, [{ width: 1024, height: 640 }, { width: 800, height: 900 }], true)).toBe(0.5)
  })

  it('returns undefined without measurable pane or images', () => {
    expect(fitVisualZoom({ width: 0, height: 600 }, [{ width: 1024, height: 640 }], true)).toBeUndefined()
    expect(fitVisualZoom({ width: 800, height: 600 }, [], true)).toBeUndefined()
  })
})
