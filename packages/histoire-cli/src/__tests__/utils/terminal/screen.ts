/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import { codePointWidth } from '../../../terminal/width.js'

/** Visible result of an emulated terminal. */
export interface ScreenEmulator {
  /** Feeds output bytes as the terminal would receive them. */
  write: (data: string | Uint8Array) => void
  /** Rows of the active buffer, trailing blanks trimmed. */
  lines: () => string[]
  /** Whether the alternate buffer is shown. */
  readonly alternate: boolean
  /** Whether the cursor is visible. */
  readonly cursorVisible: boolean
  /** Cursor position in the active buffer. */
  cursor: () => { row: number, column: number }
}

/** One screen buffer: rows of cells (a wide glyph leaves an empty cell behind). */
interface Buffer2D {
  rows: string[][]
  row: number
  column: number
}

/**
 * Minimal terminal emulator for the control sequences the surface emits: cursor up,
 * home, erase below/line, clear, alternate screen, cursor visibility. `\n` behaves as
 * `\r\n` (output processing of a raw-mode terminal). Everything else is ignored.
 * @param columns Terminal width.
 * @param rows Terminal height.
 */
export function createScreenEmulator(columns: number, rows: number): ScreenEmulator {
  const fresh = (): Buffer2D => ({ rows: Array.from({ length: rows }, () => []), row: 0, column: 0 })
  const normal = fresh()
  const alt = fresh()
  let current = normal
  let cursorVisible = true
  const decoder = new TextDecoder()

  /** Scrolls the buffer up when the cursor passes the last row. */
  function lineFeed(buffer: Buffer2D) {
    buffer.column = 0
    if (buffer.row === rows - 1) {
      buffer.rows.shift()
      buffer.rows.push([])
    }
    else {
      buffer.row++
    }
  }

  /** Applies one CSI sequence. */
  function csi(params: string, final: string) {
    const count = Number(params.replace('?', '')) || 1
    if (params === '?1049' && (final === 'h' || final === 'l')) {
      current = final === 'h' ? alt : normal
      if (final === 'h') Object.assign(alt, fresh())
    }
    else if (params === '?25') {
      cursorVisible = final === 'h'
    }
    else if (final === 'A') {
      current.row = Math.max(0, current.row - count)
    }
    else if (final === 'H') {
      Object.assign(current, { row: 0, column: 0 })
    }
    else if (final === 'K') {
      current.rows[current.row].length = Math.min(current.rows[current.row].length, current.column)
    }
    else if (final === 'J') {
      const clearAll = params === '2'
      if (params === '3') return
      current.rows[current.row].length = clearAll ? 0 : Math.min(current.rows[current.row].length, current.column)
      for (let row = clearAll ? 0 : current.row + 1; row < rows; row++) {
        if (clearAll || row > current.row) current.rows[row] = []
      }
    }
  }

  return {
    write(data) {
      const text = typeof data === 'string' ? data : decoder.decode(data)
      for (let index = 0; index < text.length;) {
        const char = text[index]
        if (char === '\u001B' && text[index + 1] === '[') {
          const match = /^\u001B\[([0-9;:?]*)([a-z])/i.exec(text.slice(index))
          if (match) {
            csi(match[1], match[2])
            index += match[0].length
            continue
          }
        }
        index++
        if (char === '\n') {
          lineFeed(current)
        }
        else if (char === '\r') {
          current.column = 0
        }
        else if (char >= ' ') {
          const width = codePointWidth(char.codePointAt(0)!)
          if (width === 0) continue
          if (current.column + width > columns) lineFeed(current)
          const cells = current.rows[current.row]
          while (cells.length < current.column) cells.push(' ')
          cells[current.column] = char
          if (width === 2) cells[current.column + 1] = ''
          current.column += width
        }
      }
    },
    lines: () => current.rows.map(cells => cells.join('').trimEnd()),
    get alternate() {
      return current === alt
    },
    get cursorVisible() {
      return cursorVisible
    },
    cursor: () => ({ row: current.row, column: current.column }),
  }
}
