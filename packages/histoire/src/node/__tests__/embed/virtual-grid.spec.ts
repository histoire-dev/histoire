import { describe, expect, it } from 'vitest'
import { VirtualGridGeometry } from '../../../../../histoire-app/src/app/components/story/virtual-grid.js'

describe('virtual grid geometry', () => {
  it('computes exact visible rows with measured variable heights and no overscan', () => {
    const geometry = new VirtualGridGeometry(1000, 4, 16, 200)
    geometry.setRowHeight(10, 360)

    const rowTop = geometry.rowTop(10)
    expect(geometry.visibleRange(rowTop + 40, 300)).toEqual({ start: 10, end: 11 })
    expect(geometry.visibleRange(rowTop + 40, 400)).toEqual({ start: 10, end: 12 })
    expect(geometry.rowTop(11)).toBe(rowTop + 376)
    expect(geometry.totalHeight).toBe(54_144)
  })

  it('scales row lookup to large grids and supports changed estimates', () => {
    const geometry = new VirtualGridGeometry(100_000, 4, 16, 200)
    expect(geometry.rowCount).toBe(25_000)

    geometry.setRowHeight(20_000, 360)
    geometry.setEstimatedRowHeight(240)

    expect(geometry.rowTop(20_001)).toBe(20_001 * 256 + 120)
    expect(geometry.visibleRange(geometry.rowTop(20_000), 200)).toEqual({ start: 20_000, end: 20_001 })
  })

  it('resets measured rows when column layout changes', () => {
    const geometry = new VirtualGridGeometry(12, 3, 16, 200)
    geometry.setRowHeight(1, 280)

    geometry.reset(12, 2)

    expect(geometry.rowCount).toBe(6)
    expect(geometry.rowTop(2)).toBe(432)
  })
})
