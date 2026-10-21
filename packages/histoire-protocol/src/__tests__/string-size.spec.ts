import { describe, expect, it } from 'vitest'
import { measureWireValue } from '../bridge/size.js'
import { countWireString } from '../bridge/string-size.js'

/** Strings covering escapes, controls, multibyte, paired and lone surrogates at every boundary. */
const samples = ['', 'plain', '"\\\b\f\n\r\t', '\u0000\u001F\u007F', '\u00E9\u07FF\u0800', '\u2028\u2029', '\uD83D\uDE00', 'a\uD83D\uDE00b', '\uD800', '\uDC00', 'x\uD800', '\uDBFF\uDBFF\uDFFF', '\uDC00\uD800', '\uD83D\uDE00\uD83D', '\uFFFF']

/**
 * Counts one string without a budget.
 * @param value String to count.
 * @param json Whether JSON escaping applies.
 * @returns Exact byte total.
 */
function count(value: string, json: boolean): number {
  return countWireString(value, json, Number.POSITIVE_INFINITY)
}

describe('wire string accounting', () => {
  it('matches JSON and UTF-8 encoders on escape and surrogate edges', () => {
    const encoder = new TextEncoder()
    for (const value of samples) {
      expect(count(value, true)).toBe(encoder.encode(JSON.stringify(value)).length)
      expect(count(value, false)).toBe(encoder.encode(value).length)
    }
  })

  it('matches JSON encoding for nested keys and values', () => {
    const value = { [samples.join('')]: [samples, { '\uD800key': samples.slice().reverse() }], nested: [[[{ '': '' }]]] }
    expect(measureWireValue(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).length)
  })

  it('stops counting once string exceeds byte budget', () => {
    expect(countWireString('x'.repeat(1000), false, 10)).toBe(11)
    expect(countWireString('\u00E9', true, 0)).toBe(2)
    expect(() => measureWireValue('\uD83D\uDE00'.repeat(10), { maxBytes: 41 })).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
    expect(measureWireValue('\uD83D\uDE00'.repeat(10), { maxBytes: 42 })).toBe(42)
  })
})
