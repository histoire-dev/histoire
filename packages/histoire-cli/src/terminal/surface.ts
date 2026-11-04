/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this module */
import type { Buffer } from 'node:buffer'
import type { Writable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { sanitizeText } from './output/sanitize.js'
import { TERMINAL_BOUNDS, truncateText } from './protocol/core.js'
import { displayWidth, fitWidth } from './width.js'

/** Output stream the surface paints on. */
export type SurfaceStream = Pick<Writable, 'write'> & { columns?: number, rows?: number }

/** Source of the pinned panel and of an optional full-screen view. */
export interface SurfaceContent {
  /** Panel lines (already fitted); drawn under the log area on the normal screen. */
  panel: () => string[]
  /** Full-screen lines while a view is open; undefined shows the normal screen. */
  screen: () => string[] | undefined
}

/** Screen painter: logs scroll above a pinned panel; views use the alternate screen. */
export interface Surface {
  /** Hides the cursor and draws the panel. Idempotent. */
  attach: () => void
  /** Removes the panel, leaves the alternate screen, shows the cursor, flushes held text. Idempotent. */
  detach: () => void
  /** Inserts log output above the panel; held on the alternate screen and shown on return. */
  write: (stream: 'stdout' | 'stderr', data: string | Uint8Array) => void
  /** Redraws the active screen (state or size changed). */
  repaint: () => void
  /** Clears the visible normal screen. Retained histories are untouched. */
  clear: () => void
  /** Whether the surface is attached. */
  readonly attached: boolean
}

/** Alternate screen enter/leave and cursor visibility. */
const ENTER_ALTERNATE = '\u001B[?1049h'
const LEAVE_ALTERNATE = '\u001B[?1049l'
const HIDE_CURSOR = '\u001B[?25l'
const SHOW_CURSOR = '\u001B[?25h'
/** Erases from the cursor to the end of the screen. */
const ERASE_BELOW = '\r\u001B[J'
/** Log text held while a view owns the screen is bounded. */
const MAX_HELD_LINES = 2000
/** An unfinished log line is shown after this quiet period so it is never lost. */
const TAIL_FLUSH_MS = 150
/** Longest unfinished or complete line kept; the same bound the retained-log decoder applies. */
const MAX_LINE_LENGTH = TERMINAL_BOUNDS.logTextLength
/** Matches SGR styling, the only escape kept in child output. */
const SGR = /(\u001B\[[0-9;:]*m)/

/**
 * Keeps colors of child output but removes every other control sequence, so logs
 * cannot move the cursor or leave the panel region. The line is bounded, and a carriage
 * return keeps only the text after it (what a terminal would show), so the row can never
 * rewrite itself later.
 * @param line One complete line.
 */
function cleanLine(line: string) {
  const bounded = truncateText(line.endsWith('\r') ? line.slice(0, -1) : line, MAX_LINE_LENGTH).text
  return bounded.slice(bounded.lastIndexOf('\r') + 1).split(SGR).map((part, index) => index % 2 ? part : sanitizeText(part)).join('')
}

/**
 * Creates the painter. Every terminal write is guarded: a failing stream reports once
 * through `onFailure` and the surface goes inert, so a render failure never stops the server.
 * @param options Stream, content providers and failure callback.
 * @param options.stdout Terminal output stream.
 * @param options.content Panel and screen providers.
 * @param options.onFailure Called once when painting fails.
 */
export function createSurface(options: { stdout: SurfaceStream, content: SurfaceContent, onFailure: (error: unknown) => void }): Surface {
  const { stdout, content } = options
  let attached = false
  let failed = false
  let alternate = false
  /** Panel lines currently on the normal screen. */
  let drawn: string[] = []
  const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
  const tails = { stdout: '', stderr: '' }
  let held: string[] = []
  let tailTimer: ReturnType<typeof setTimeout> | undefined

  /** Runs painting work; the first failure reports and silences the surface. */
  function guard(work: () => void) {
    if (failed) return
    try {
      work()
    }
    catch (error) {
      failed = true
      options.onFailure(error)
    }
  }

  /** Terminal rows the drawn panel occupies at the current width (long lines may wrap after a resize). */
  function drawnRows() {
    const columns = Math.max(1, stdout.columns ?? 80)
    return drawn.reduce((rows, line) => rows + Math.max(1, Math.ceil(displayWidth(line) / columns)), 0)
  }

  /** Moves to the panel's first row and erases it; empty when no panel is drawn. */
  function erase() {
    const rows = drawnRows()
    if (!rows) return ''
    return `${rows > 1 ? `\u001B[${rows - 1}A` : ''}${ERASE_BELOW}`
  }

  /** Panel text; the cursor stays at the end of its last line. */
  function panel(lines = content.panel()) {
    drawn = lines
    return `\u001B[0m${drawn.join('\n')}`
  }

  /** Full-screen text for the alternate screen. */
  function screen(lines: string[]) {
    const columns = stdout.columns ?? 80
    const rows = stdout.rows ?? 24
    return `\u001B[H${lines.slice(0, rows).map(line => `${fitWidth(line, columns)}\u001B[K`).join('\r\n')}\u001B[J`
  }

  /** Writes complete lines above the panel in a single stream write. */
  function insert(lines: string[]) {
    if (!lines.length) return
    if (alternate) {
      held.push(...lines)
      if (held.length > MAX_HELD_LINES) held = held.slice(-MAX_HELD_LINES)
      return
    }
    stdout.write(`${erase()}\u001B[0m${lines.join('\n')}\n${panel()}`)
  }

  /** Emits unfinished text of both streams, ending their lines. */
  function flushTails() {
    clearTimeout(tailTimer)
    tailTimer = undefined
    const lines = (['stdout', 'stderr'] as const).flatMap((name) => {
      const tail = tails[name] + decoders[name].end()
      tails[name] = ''
      return tail ? [cleanLine(tail)] : []
    })
    guard(() => insert(lines))
  }

  /** Brings the terminal in line with the content: alternate screen when a view is open. */
  function paint() {
    const lines = content.screen()
    if (lines) {
      if (!alternate) stdout.write(ENTER_ALTERNATE)
      alternate = true
      stdout.write(screen(lines))
      return
    }
    if (alternate) {
      alternate = false
      const returning = held
      held = []
      stdout.write(LEAVE_ALTERNATE)
      stdout.write(`${erase()}${returning.length ? `\u001B[0m${returning.join('\n')}\n` : ''}${panel()}`)
      return
    }
    // Timer ticks and unrelated state changes must not repaint an unchanged panel.
    const next = content.panel()
    if (drawn.length === next.length && drawn.every((line, index) => line === next[index])) return
    stdout.write(`${erase()}${panel(next)}`)
  }

  return {
    get attached() {
      return attached
    },
    attach() {
      if (attached) return
      attached = true
      guard(() => {
        stdout.write(HIDE_CURSOR)
        paint()
      })
    },
    detach() {
      if (!attached) return
      attached = false
      flushTails()
      // Restoration is attempted even after a failure; it must not throw.
      try {
        if (alternate) stdout.write(LEAVE_ALTERNATE)
        alternate = false
        stdout.write(`${erase()}${held.length ? `${held.join('\n')}\n` : ''}${SHOW_CURSOR}`)
      }
      catch {}
      held = []
      drawn = []
    },
    write(stream, data) {
      if (!attached) return
      const text = tails[stream] + (typeof data === 'string' ? data : decoders[stream].write(data as Buffer))
      const end = text.lastIndexOf('\n')
      const complete = end >= 0 ? text.slice(0, end).split('\n').map(cleanLine) : []
      tails[stream] = text.slice(end + 1)
      // An unterminated line past the bound is emitted now instead of growing without limit.
      if (tails[stream].length > MAX_LINE_LENGTH) {
        complete.push(cleanLine(tails[stream]))
        tails[stream] = ''
      }
      // The timer is not restarted by later writes, so a spinner that never ends its line is still shown.
      if ((tails.stdout || tails.stderr) && !tailTimer) {
        tailTimer = setTimeout(flushTails, TAIL_FLUSH_MS)
        tailTimer.unref()
      }
      else if (!tails.stdout && !tails.stderr) {
        clearTimeout(tailTimer)
        tailTimer = undefined
      }
      if (complete.length) guard(() => insert(complete))
    },
    repaint() {
      if (attached) guard(paint)
    },
    clear() {
      if (!attached) return
      held = []
      guard(() => {
        if (alternate) return
        stdout.write(`${erase()}\u001B[2J\u001B[3J\u001B[H${panel()}`)
      })
    },
  }
}
