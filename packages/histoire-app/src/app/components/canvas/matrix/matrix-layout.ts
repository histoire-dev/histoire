import type { MatrixCellData, MatrixValue } from '../../../util/matrix.js'
import type { CanvasFrameLayout } from '../frame-layout.js'
import type { CanvasRect, CanvasSize } from '../pan/usePanZoom.js'
import { equalMatrixValue } from '../../../util/matrix-values.js'
import { canvasFrameBounds, canvasTrackOffsets } from '../frame-layout.js'
import { clampZoom } from '../pan/usePanZoom.js'

/** Fixed toolbar, story heading and axis controls above the matrix board. */
export const MATRIX_TOP_INSET = 184
/** Row labels retain readable width independently of preview zoom. */
export const MATRIX_ROW_GUTTER = 128
/** Column labels sit above previews in unscaled screen pixels. */
export const MATRIX_COLUMN_HEADER = 28
/** Adjacent previews retain the same screen-space separation. */
const MATRIX_GAP = 16

/** Inputs keep runtime preview dimensions separate from fixed board chrome. */
interface MatrixLayoutOptions {
  /** Exact catalog story owner. */
  storyId: string
  /** Selected canonical preset replicated by every cell. */
  variantId: string
  /** Visible row values in source order. */
  rows: readonly MatrixValue[]
  /** Visible column values in source order. */
  cols: readonly MatrixValue[]
  /** Logical preview dimensions from existing viewport settings. */
  size: CanvasSize | ((cell: MatrixCellData) => CanvasSize)
  /** Current numeric zoom; chrome converts screen pixels into world units. */
  zoom: number
}

/** Place previews in world coordinates without scaling labels or gaps. */
export function layoutMatrixFrames(cells: readonly MatrixCellData[], options: MatrixLayoutOptions): CanvasFrameLayout[] {
  const scale = clampZoom(options.zoom)
  const sizes = cells.map(cell => typeof options.size === 'function' ? options.size(cell) : options.size)
  const rows = cells.map(cell => options.rows.findIndex(value => equalMatrixValue(value, cell.row)))
  const cols = cells.map(cell => options.cols.findIndex(value => equalMatrixValue(value, cell.col)))
  const widths = options.cols.map(() => 0)
  const heights = options.rows.map(() => 0)
  sizes.forEach((size, index) => {
    widths[cols[index]] = Math.max(widths[cols[index]], size.width)
    heights[rows[index]] = Math.max(heights[rows[index]], size.height)
  })
  const xs = canvasTrackOffsets(widths, MATRIX_GAP / scale, MATRIX_ROW_GUTTER / scale)
  const ys = canvasTrackOffsets(heights, MATRIX_GAP / scale, MATRIX_COLUMN_HEADER / scale)
  return cells.map((cell, index) => ({
    id: cell.key,
    storyId: options.storyId,
    variantId: options.variantId,
    x: xs[cols[index]],
    y: ys[rows[index]],
    width: sizes[index].width,
    height: sizes[index].height,
    ...(typeof options.size === 'function' ? { rowBottom: ys[rows[index]] + heights[rows[index]] } : {}),
  }))
}

/** Include row and column labels once, without artificial scaled outer margins. */
export function matrixLayoutBounds(frames: readonly CanvasRect[]): CanvasRect {
  const bounds = canvasFrameBounds(frames)
  return { x: 0, y: 0, width: bounds.x + bounds.width, height: bounds.y + bounds.height }
}
