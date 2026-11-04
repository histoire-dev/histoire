import type { DecodedLine } from '../terminal/output/decoder.js'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createLineDecoder } from '../terminal/output/decoder.js'

/** Decodes chunks and returns every emitted line. */
function decode(chunks: Array<string | Uint8Array>, secrets: string[] = [], max?: number): DecodedLine[] {
  const lines: DecodedLine[] = []
  const decoder = createLineDecoder(line => lines.push(line), secrets, max)
  for (const chunk of chunks) decoder.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  decoder.end()
  return lines
}

// Boundary: real streaming decoder/sanitizer. Defects: mojibake or lost text at
// chunk boundaries, terminal injection, credential leaks, unbounded buffers.
describe('line decoder', () => {
  it('reassembles characters and lines split across chunks, including a final unterminated line', () => {
    const bytes = Buffer.from('start 😀 done\nrest')
    const split = bytes.indexOf(0xF0) + 2
    expect(decode([bytes.subarray(0, split), bytes.subarray(split)]).map(line => line.text)).toEqual(['start 😀 done', 'rest'])
  })

  it('treats a bare carriage return as a rewrite of the unfinished line but CRLF as a terminator', () => {
    expect(decode(['10%\r50%\r100%\n', 'a\r', '\nb']).map(line => line.text)).toEqual(['100%', 'a', 'b'])
  })

  it('removes escape sequences even when split across chunks and keeps tab/newline text', () => {
    const lines = decode(['\x1B[3', '1mred\x1B[0m\tok\n', '\x1B]0;title', '\x07shown\x07bell\x00\n', 'a\x1B\\b\n'])
    expect(lines.map(line => line.text)).toEqual(['red\tok', 'shownbell', 'ab'])
  })

  it('does not let an unterminated string sequence swallow later lines', () => {
    expect(decode(['\x1B]0;never closed\nnext line\n']).map(line => line.text)).toEqual(['', 'next line'])
  })

  it('redacts configured credentials, including a fragment cut by the line bound', () => {
    const secret = 'abcdef0123456789'
    expect(decode([`token=${secret}!\n`], [secret])[0].text).toBe('token=[credential]!')
    const [cut] = decode([`${'x'.repeat(20)}${secret}${'y'.repeat(50)}\n`], [secret], 30)
    expect(cut.truncated).toBeGreaterThan(0)
    expect(cut.text).not.toContain('abcd')
  })

  it('bounds oversized lines with an explicit count and keeps draining following lines', () => {
    const lines = decode([`${'a'.repeat(100)}`, 'b'.repeat(100), '\nafter\n'], [], 64)
    expect(lines).toEqual([{ text: 'a'.repeat(64), truncated: 136 }, { text: 'after', truncated: 0 }])
  })
})
