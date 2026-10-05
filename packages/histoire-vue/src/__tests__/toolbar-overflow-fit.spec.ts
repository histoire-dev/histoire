import { describe, expect, it } from 'vitest'
import { fitOverflowItems } from '../../../histoire-app/src/app/components/base/overflow/fit.js'

describe('toolbar overflow fitting', () => {
  it('reserves trigger only once content exceeds available width', () => {
    const items = [{ width: 40 }, { width: 50 }, { width: 60 }]
    expect(fitOverflowItems(items, 156, 28, 3)).toBe(3)
    expect(fitOverflowItems(items, 155, 28, 3)).toBe(2)
    expect(fitOverflowItems(items, 70, 28, 3)).toBe(0)
    expect(fitOverflowItems(items, 71, 28, 3)).toBe(1)
  })

  it('counts dividers only between nonempty groups and preserves fractional widths', () => {
    const items = [{ width: 0, separatorBefore: true }, { width: 40.25, separatorBefore: true }, { width: 50.5, separatorBefore: true }]
    expect(fitOverflowItems(items, 103.75, 28, 3, 10)).toBe(3)
    expect(fitOverflowItems(items, 103.74, 28, 3, 10)).toBe(2)
    expect(fitOverflowItems(items, 0, 28, 3, 10)).toBe(1)
    expect(fitOverflowItems([], 0, 28, 3)).toBe(0)
  })
})
