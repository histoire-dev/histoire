import { describe, expect, it } from 'vitest'
import { positionPopover, reservePopoverInlineEnd } from '../../../histoire-app/src/app/components/base/popover/position.js'

describe('toolbar surface placement', () => {
  it('reserves inspector space on the logical end and clamps both panel edges', () => {
    const surface = { left: 56, top: 0, right: 700, bottom: 680 }
    const anchor = { left: 180, width: 28, bottom: 52 } as DOMRect
    const viewport = { width: 700, height: 680 }
    const ltr = reservePopoverInlineEnd(surface, 344, 'ltr')
    const rtl = reservePopoverInlineEnd(surface, 344, 'rtl')
    expect(ltr).toEqual({ left: 56, top: 0, right: 356, bottom: 680 })
    expect(rtl).toEqual({ left: 400, top: 0, right: 700, bottom: 680 })
    const leftPanel = positionPopover(anchor, ltr, viewport, 280)
    const rightPanel = positionPopover(anchor, rtl, viewport, 280)
    expect(leftPanel.left).toBeGreaterThanOrEqual(ltr.left + 8)
    expect(leftPanel.left + leftPanel.width).toBeLessThanOrEqual(ltr.right - 8)
    expect(rightPanel.left).toBeGreaterThanOrEqual(rtl.left + 8)
    expect(rightPanel.left + rightPanel.width).toBeLessThanOrEqual(rtl.right - 8)
    expect(surface).toEqual({ left: 56, top: 0, right: 700, bottom: 680 })
  })

  it('opens above a trigger near the bottom edge and can align to its start', () => {
    const bounds = { left: 0, top: 0, right: 700, bottom: 680 }
    const viewport = { width: 700, height: 680 }
    const anchor = { left: 60, width: 28, top: 620, bottom: 648 } as DOMRect
    const above = positionPopover(anchor, bounds, viewport, 220, { height: 200, align: 'start' })
    expect(above).toEqual({ left: 60, top: 414, width: 220, maxHeight: 606 })
    // Room below keeps the default placement.
    expect(positionPopover({ ...anchor, top: 40, bottom: 68 } as DOMRect, bounds, viewport, 220, { height: 200 }).top).toBe(74)
  })

  it('prefers opening above when asked and the panel fits there', () => {
    const bounds = { left: 0, top: 0, right: 700, bottom: 680 }
    const viewport = { width: 700, height: 680 }
    const anchor = { left: 60, width: 28, top: 400, bottom: 428 } as DOMRect
    expect(positionPopover(anchor, bounds, viewport, 220, { height: 200, side: 'top' }).top).toBe(194)
    // Not enough room above for the panel, more room below: stays below.
    expect(positionPopover({ ...anchor, top: 100, bottom: 128 } as DOMRect, bounds, viewport, 220, { height: 200, side: 'top' }).top).toBe(134)
  })
})
