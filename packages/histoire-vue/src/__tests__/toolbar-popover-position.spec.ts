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
})
