/** One indivisible item measured in its inline presentation. */
export interface OverflowFitItem {
  /** Natural width, excluding separators; zero marks an empty item. */
  width: number
  /** Divider appears only when another nonempty item precedes this one. */
  separatorBefore?: boolean
}

/** Keep longest fitting prefix, reserving trigger only when something overflows. */
export function fitOverflowItems(items: readonly OverflowFitItem[], available: number, trigger: number, gap = 0, separator = 0): number {
  let total = 0
  let populated = false
  const widths = items.map((item) => {
    if (item.width <= 0) return 0
    const width = item.width + (populated ? gap + (item.separatorBefore ? separator : 0) : 0)
    populated = true
    total += width
    return width
  })
  if (total <= available) return items.length
  const budget = Math.max(0, available - trigger - gap)
  let used = 0
  for (let index = 0; index < widths.length; index++) {
    used += widths[index]
    if (used > budget) return index
  }
  return items.length
}
