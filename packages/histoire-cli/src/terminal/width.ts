/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
/** Terminal cell widths without a dependency: SGR-aware, East Asian wide and emoji aware. */

/** Matches one SGR sequence (the only escape kind panels and views emit) or one code point. */
const TOKEN = /\u001B\[[0-9;]*m|[\s\S]/gu

/** Inclusive code point ranges that occupy two cells. */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115F],
  // Default emoji presentation inside the symbol blocks (the rest of those blocks is narrow).
  [0x231A, 0x231B],
  [0x23E9, 0x23EC],
  [0x23F0, 0x23F0],
  [0x23F3, 0x23F3],
  [0x25FD, 0x25FE],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267F, 0x267F],
  [0x2693, 0x2693],
  [0x26A1, 0x26A1],
  [0x26AA, 0x26AB],
  [0x26BD, 0x26BE],
  [0x26C4, 0x26C5],
  [0x26CE, 0x26CE],
  [0x26D4, 0x26D4],
  [0x26EA, 0x26EA],
  [0x26F2, 0x26F3],
  [0x26F5, 0x26F5],
  [0x26FA, 0x26FA],
  [0x26FD, 0x26FD],
  [0x2705, 0x2705],
  [0x270A, 0x270B],
  [0x2728, 0x2728],
  [0x274C, 0x274C],
  [0x274E, 0x274E],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27B0, 0x27B0],
  [0x27BF, 0x27BF],
  [0x2B1B, 0x2B1C],
  [0x2B50, 0x2B50],
  [0x2B55, 0x2B55],
  [0x2E80, 0x303E],
  [0x3041, 0x33FF],
  [0x3400, 0x4DBF],
  [0x4E00, 0x9FFF],
  [0xA000, 0xA4CF],
  [0xAC00, 0xD7A3],
  [0xF900, 0xFAFF],
  [0xFE30, 0xFE6F],
  [0xFF00, 0xFF60],
  [0xFFE0, 0xFFE6],
  [0x1F300, 0x1F64F],
  [0x1F680, 0x1F6FF],
  [0x1F7E0, 0x1F7EB],
  [0x1F900, 0x1F9FF],
  [0x1FA70, 0x1FAFF],
  [0x20000, 0x3FFFD],
]

/** Inclusive code point ranges that occupy no cell (combining marks, joiners, variation selectors). */
const ZERO: readonly (readonly [number, number])[] = [
  [0x0300, 0x036F],
  [0x1AB0, 0x1AFF],
  [0x1DC0, 0x1DFF],
  [0x200B, 0x200F],
  [0x20D0, 0x20FF],
  [0xFE00, 0xFE0F],
  [0xFE20, 0xFE2F],
  // Emoji skin-tone modifiers color the previous glyph.
  [0x1F3FB, 0x1F3FF],
  [0xE0100, 0xE01EF],
]

/** Zero width joiner: the code point after it joins the previous glyph. */
const JOINER = 0x200D

/** Reset appended after a truncated styled line so styling cannot leak. */
const RESET = '\u001B[0m'

/** Whether a code point is inside one of the ranges. */
function within(code: number, ranges: readonly (readonly [number, number])[]) {
  return ranges.some(([from, to]) => code >= from && code <= to)
}

/**
 * Number of terminal cells one code point occupies.
 * @param code Unicode code point.
 */
export function codePointWidth(code: number): number {
  if (code < 0x20 || (code >= 0x7F && code < 0xA0)) return 0
  if (within(code, ZERO)) return 0
  return within(code, WIDE) ? 2 : 1
}

/**
 * Splits text into SGR sequences (zero cells) and code points with their widths.
 * @param text Text, possibly styled with SGR sequences.
 */
function* cells(text: string): Generator<{ token: string, width: number }> {
  let joined = false
  for (const [token] of text.matchAll(TOKEN)) {
    if (token.length > 1 && token.startsWith('\u001B')) {
      yield { token, width: 0 }
      continue
    }
    const code = token.codePointAt(0)!
    yield { token, width: joined ? 0 : codePointWidth(code) }
    joined = code === JOINER
  }
}

/**
 * Display width of text in terminal cells, ignoring SGR styling.
 * @param text Text without cursor-moving controls.
 */
export function displayWidth(text: string): number {
  let width = 0
  for (const cell of cells(text)) width += cell.width
  return width
}

/**
 * Truncates text to at most `columns` cells, marking the cut with an ellipsis.
 * Styling stays balanced when a styled line is cut.
 * @param text Single line of text.
 * @param columns Cell budget.
 */
export function fitWidth(text: string, columns: number): string {
  if (columns <= 0) return ''
  if (displayWidth(text) <= columns) return text
  let result = ''
  let width = 0
  let styled = false
  for (const cell of cells(text)) {
    if (cell.width === 0) {
      if (cell.token.startsWith('\u001B')) styled = true
      result += cell.token
      continue
    }
    // One cell stays reserved for the ellipsis.
    if (width + cell.width > columns - 1) break
    result += cell.token
    width += cell.width
  }
  return `${result}…${styled ? RESET : ''}`
}

/**
 * Wraps text into lines of at most `columns` cells, breaking mid-word only when needed.
 * @param text Text that may contain newlines.
 * @param columns Cell budget per line.
 */
export function wrapWidth(text: string, columns: number): string[] {
  if (columns <= 0) return []
  const lines: string[] = []
  for (const source of text.split('\n')) {
    let line = ''
    let width = 0
    for (const cell of cells(source)) {
      // An empty line keeps even a glyph wider than the budget, so no blank line is emitted before it.
      if (cell.width > 0 && width > 0 && width + cell.width > columns) {
        lines.push(line)
        line = ''
        width = 0
      }
      line += cell.token
      width += cell.width
    }
    lines.push(line)
  }
  return lines
}
