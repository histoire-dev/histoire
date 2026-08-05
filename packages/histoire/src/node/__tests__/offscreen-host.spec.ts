import { describe, expect, it } from 'vitest'
import { applyOffscreenHostStyle } from '../virtual/offscreen-host.js'

describe('applyOffscreenHostStyle', () => {
  it('moves the host off-viewport while preserving layout and visibility semantics', () => {
    const style: Record<string, string> = {}
    const host = { style } as unknown as HTMLElement

    applyOffscreenHostStyle(host)

    expect(style.position).toBe('fixed')
    expect(style.top).toBe('0px')
    expect(style.left).toBe('-10000px')
    // Keep a realistic viewport-sized box so layout-dependent assertions
    // (getBoundingClientRect, responsive styles) behave like the real preview.
    expect(style.width).toBe('100vw')
    expect(style.height).toBe('100vh')
    // display/visibility/opacity must stay untouched: the host is the canvas
    // user tests assert on, and e.g. `display: none` collapses layout while
    // `visibility`/`opacity` break `toBeVisible()`-style checks.
    expect(style.display).toBeUndefined()
    expect(style.visibility).toBeUndefined()
    expect(style.opacity).toBeUndefined()
  })
})
