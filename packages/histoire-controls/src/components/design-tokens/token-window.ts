/** One ordered responsive row of token payloads. */
export interface TokenRow<T extends { key: string }> {
  /** Identity changes when responsive column grouping changes. */
  key: string
  /** Original processed token records, in source order. */
  tokens: readonly T[]
}

/** Native-scroll interval and spacer sizes for a variable-height row collection. */
export interface VirtualRowRange {
  /** First rendered row, inclusive. */
  start: number
  /** Last rendered row, exclusive. */
  end: number
  /** Space reserved before first rendered row. */
  offsetTop: number
  /** Space reserved after last rendered row. */
  offsetBottom: number
  /** Complete native document extent represented by rendered rows and spacers. */
  totalSize: number
}

/** Cached row dimensions; native scroll updates only query this prefix index. */
export interface VirtualRowMetrics {
  /** Positive measured values or the supplied estimate for each row. */
  sizes: readonly number[]
  /** Prefix sum where index n is total size of rows before n. */
  offsets: readonly number[]
  /** Complete virtual document extent. */
  totalSize: number
}

/** Group ordered tokens into responsive rows without changing token identity. */
export function groupTokenRows<T extends { key: string }>(tokens: readonly T[], columns: number): TokenRow<T>[] {
  const columnCount = Math.max(1, Math.floor(columns))
  const rows: TokenRow<T>[] = []
  for (let index = 0; index < tokens.length; index += columnCount) {
    const items = tokens.slice(index, index + columnCount)
    // Include full row membership so filtering/reflow cannot reuse stale measurements.
    rows.push({ key: JSON.stringify([columnCount, items.map(item => item.key)]), tokens: items })
  }
  return rows
}

/** Match the token grid's auto-fill sizing rule using its measured inner width. */
export function getGridColumnCount(width: number, columnSize: number, gap = 16): number {
  const innerWidth = Math.max(0, width)
  if (!innerWidth) return 1
  const minColumnWidth = Math.min(innerWidth, Math.max(1, columnSize))
  return Math.max(1, Math.floor((innerWidth + gap) / (minColumnWidth + gap)))
}

/** Compute measured/estimated row sizes and a bounded interval around native scroll. */
export function getVirtualRowRange(
  rowSizes: readonly number[],
  scrollOffset: number,
  viewportSize: number,
  overscan: number,
  estimatedSize = 160,
): VirtualRowRange {
  return getVirtualRowRangeFromMetrics(createVirtualRowMetrics(rowSizes, estimatedSize), scrollOffset, viewportSize, overscan)
}

/** Build row dimensions and prefix sums when measurements or grouping change. */
export function createVirtualRowMetrics(rowSizes: readonly number[], estimatedSize = 160): VirtualRowMetrics {
  const estimate = Math.max(1, estimatedSize)
  const sizes = rowSizes.map(size => Number.isFinite(size) && size > 0 ? size : estimate)
  const offsets = Array.from({ length: sizes.length + 1 }, () => 0)
  offsets[0] = 0
  for (let index = 0; index < sizes.length; index++) offsets[index + 1] = offsets[index] + sizes[index]
  return { sizes, offsets, totalSize: offsets[sizes.length] }
}

/** Find visible rows from a cached prefix index in logarithmic time. */
export function getVirtualRowRangeFromMetrics(metrics: VirtualRowMetrics, scrollOffset: number, viewportSize: number, overscan: number): VirtualRowRange {
  const { offsets, totalSize } = metrics
  const count = metrics.sizes.length
  if (!count) return { start: 0, end: 0, offsetTop: 0, offsetBottom: 0, totalSize: 0 }

  const startOffset = Math.max(0, Math.min(scrollOffset, totalSize))
  const endOffset = Math.max(startOffset, Math.min(startOffset + Math.max(0, viewportSize), totalSize))
  const visibleStart = startOffset >= totalSize ? count - 1 : firstRowEndingAfter(offsets, startOffset)
  const visibleEnd = endOffset <= startOffset
    ? Math.min(count, visibleStart + 1)
    : Math.max(visibleStart + 1, firstRowStartingAtOrAfter(offsets, endOffset))
  const pad = Math.max(0, Math.floor(overscan))
  const start = Math.max(0, visibleStart - pad)
  const end = Math.min(count, visibleEnd + pad)

  return {
    start,
    end,
    offsetTop: offsets[start],
    offsetBottom: totalSize - offsets[end],
    totalSize,
  }
}

/** Find first row whose bottom extends beyond an offset. */
function firstRowEndingAfter(offsets: readonly number[], offset: number): number {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle + 1] <= offset) low = middle + 1
    else high = middle
  }
  return Math.min(low, offsets.length - 2)
}

/** Find the first row whose top starts at or after an offset. */
function firstRowStartingAtOrAfter(offsets: readonly number[], offset: number): number {
  let low = 1
  let high = offsets.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle] < offset) low = middle + 1
    else high = middle
  }
  return low
}
