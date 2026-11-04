import { StringDecoder } from 'node:string_decoder'
import { TERMINAL_BOUNDS, truncateText } from '../protocol/core.js'
import { createControlStripper, redactSecrets } from './sanitize.js'

/** One completed, sanitized output line. */
export interface DecodedLine {
  /** Text without terminators, controls or configured credentials. */
  text: string
  /** Characters dropped from an oversized line, 0 otherwise. */
  truncated: number
}

/** Streaming decoder for one stdout or stderr stream. */
export interface LineDecoder {
  /** Consumes a raw chunk; may emit zero or more lines. */
  write: (chunk: Uint8Array) => void
  /** Flushes the final unterminated line at stream end (or generation change). */
  end: () => void
}

/**
 * Creates a decoder that turns raw bytes into sanitized lines.
 * Split multibyte characters and escape sequences survive chunk boundaries,
 * `\r` rewrites the unfinished line, and oversized lines keep their head with an
 * explicit `truncated` count while the rest keeps draining.
 * @param onLine Receives each completed line.
 * @param secrets Credentials redacted before a line is emitted.
 * @param maxLength Longest retained line in UTF-16 units.
 */
export function createLineDecoder(onLine: (line: DecodedLine) => void, secrets: readonly string[] = [], maxLength: number = TERMINAL_BOUNDS.logTextLength): LineDecoder {
  const utf8 = new StringDecoder('utf8')
  const strip = createControlStripper()
  let line = ''
  let dropped = 0
  let carriage = false

  /** Emits the current line, redacted after the bound so no credential prefix survives the cut. */
  function emit() {
    const cut = truncateText(line, maxLength)
    const truncated = dropped + cut.truncated
    onLine({ text: redactSecrets(cut.text, secrets, truncated > 0), truncated })
    line = ''
    dropped = 0
  }

  /** Feeds sanitized text through the line assembler. */
  function feed(text: string) {
    for (let index = 0; index < text.length; index++) {
      const char = text[index]
      if (char === '\n') {
        carriage = false
        emit()
      }
      else if (char === '\r') {
        carriage = true
      }
      else {
        // A bare carriage return rewrites the unfinished line.
        if (carriage) {
          line = ''
          dropped = 0
          carriage = false
        }
        if (line.length < maxLength) line += char
        else dropped++
      }
    }
  }

  return {
    write(chunk) {
      feed(strip(utf8.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))))
    },
    end() {
      feed(strip(utf8.end()))
      if (line || dropped) emit()
      carriage = false
    },
  }
}
