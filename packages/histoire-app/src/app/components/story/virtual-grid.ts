/** Visible row interval in a virtual grid, with `end` exclusive. */
export interface VirtualGridRange {
  /** First row that intersects the requested viewport. */
  start: number
  /** First row after the requested viewport. */
  end: number
}

/**
 * Stores sparse row measurements and resolves row offsets without building a
 * layout object for every row. Unmeasured rows use the largest observed size.
 */
export class VirtualGridGeometry {
  /** Number of story variants represented by this grid. */
  private itemCount: number

  /** Number of columns used to group variants into rows. */
  private columns: number

  /** Vertical and horizontal spacing between grid items. */
  private gap: number

  /** Estimated height used for rows that have not been measured. */
  private estimatedHeight: number

  /** Exact row heights learned from rendered items. */
  private readonly measuredHeights = new Map<number, number>()

  /** Fenwick tree of measured-height deltas, stored sparsely by tree index. */
  private readonly heightDeltas = new Map<number, number>()

  /**
   * Creates sparse grid geometry for current item and column counts.
   * @param itemCount Number of variants in story.
   * @param columns Number of grid columns.
   * @param gap CSS gap between grid rows.
   * @param estimatedHeight Initial height for unmeasured rows.
   */
  constructor(itemCount: number, columns: number, gap: number, estimatedHeight: number) {
    this.itemCount = this.normalizeItemCount(itemCount)
    this.columns = this.normalizeColumns(columns)
    this.gap = this.normalizeGap(gap)
    this.estimatedHeight = this.normalizeHeight(estimatedHeight)
  }

  /** Number of rows needed to display all variants. */
  get rowCount(): number {
    return Math.ceil(this.itemCount / this.columns)
  }

  /** Estimated row height used for unseen rows. */
  get estimatedRowHeight(): number {
    return this.estimatedHeight
  }

  /** Total grid height, excluding outer top and bottom padding. */
  get totalHeight(): number {
    const rows = this.rowCount
    if (!rows) return 0
    return rows * this.estimatedHeight + (rows - 1) * this.gap + this.sumHeightDeltas(rows)
  }

  /**
   * Returns top offset for row, including gaps before it.
   * @param rowIndex Zero-based row index; `rowCount` resolves trailing edge.
   */
  rowTop(rowIndex: number): number {
    const index = Math.max(0, Math.min(this.rowCount, Math.floor(rowIndex)))
    return index * (this.estimatedHeight + this.gap) + this.sumHeightDeltas(index)
  }

  /**
   * Returns current height for row.
   * @param rowIndex Zero-based row index.
   */
  rowHeight(rowIndex: number): number {
    return this.measuredHeights.get(rowIndex) ?? this.estimatedHeight
  }

  /**
   * Updates exact height for a fully measured row.
   * @param rowIndex Zero-based row index.
   * @param height Measured row height in CSS pixels.
   */
  setRowHeight(rowIndex: number, height: number): void {
    const index = Math.floor(rowIndex)
    if (index < 0 || index >= this.rowCount || !Number.isFinite(height) || height <= 0) return

    const nextHeight = this.normalizeHeight(height)
    const previousHeight = this.rowHeight(index)
    if (previousHeight === nextHeight && this.measuredHeights.has(index)) return

    this.measuredHeights.set(index, nextHeight)
    this.addHeightDelta(index, nextHeight - previousHeight)
  }

  /**
   * Changes fallback height while retaining exact measurements.
   * @param height New estimated height for rows not yet measured.
   */
  setEstimatedRowHeight(height: number): void {
    const nextHeight = this.normalizeHeight(height)
    if (nextHeight === this.estimatedHeight) return

    this.estimatedHeight = nextHeight
    this.heightDeltas.clear()
    for (const [rowIndex, measuredHeight] of this.measuredHeights) {
      this.addHeightDelta(rowIndex, measuredHeight - nextHeight)
    }
  }

  /**
   * Resets measured rows after item count or column layout changes.
   * @param itemCount Number of variants in story.
   * @param columns Number of grid columns.
   */
  reset(itemCount: number, columns: number): void {
    this.itemCount = this.normalizeItemCount(itemCount)
    this.columns = this.normalizeColumns(columns)
    this.measuredHeights.clear()
    this.heightDeltas.clear()
  }

  /**
   * Finds exactly the rows intersecting a viewport; no rows are overscanned.
   * @param viewportTop Top edge relative to the first grid row.
   * @param viewportHeight Height of viewport in CSS pixels.
   */
  visibleRange(viewportTop: number, viewportHeight: number): VirtualGridRange {
    const rowCount = this.rowCount
    if (!rowCount || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      return { start: 0, end: 0 }
    }

    let low = 0
    let high = rowCount
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.rowTop(middle) + this.rowHeight(middle) <= viewportTop) low = middle + 1
      else high = middle
    }
    const start = low
    const viewportBottom = viewportTop + viewportHeight

    low = start
    high = rowCount
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.rowTop(middle) < viewportBottom) low = middle + 1
      else high = middle
    }

    return { start, end: low }
  }

  /**
   * Adds a row-height delta to sparse Fenwick nodes.
   * @param rowIndex Zero-based row index.
   * @param delta Difference from current estimated height.
   */
  private addHeightDelta(rowIndex: number, delta: number): void {
    for (let index = rowIndex + 1; index <= this.rowCount; index += index & -index) {
      const nextValue = (this.heightDeltas.get(index) ?? 0) + delta
      if (Math.abs(nextValue) < 0.0001) this.heightDeltas.delete(index)
      else this.heightDeltas.set(index, nextValue)
    }
  }

  /**
   * Returns sum of measured deltas in rows before the exclusive index.
   * @param endIndex Exclusive row index.
   */
  private sumHeightDeltas(endIndex: number): number {
    let sum = 0
    for (let index = endIndex; index > 0; index -= index & -index) {
      sum += this.heightDeltas.get(index) ?? 0
    }
    return sum
  }

  /** Normalizes variant count to a non-negative integer. */
  private normalizeItemCount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  }

  /** Normalizes column count to a positive integer. */
  private normalizeColumns(value: number): number {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
  }

  /** Normalizes grid gap to a non-negative finite value. */
  private normalizeGap(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0
  }

  /** Normalizes measured or estimated heights to positive finite values. */
  private normalizeHeight(value: number): number {
    return Number.isFinite(value) ? Math.max(1, value) : 1
  }
}
