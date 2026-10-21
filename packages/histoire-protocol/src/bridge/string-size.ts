/**
 * Counts UTF-8 bytes of one string; JSON mode adds quotes and escapes, including
 * well-formed `\uXXXX` escapes for lone surrogates.
 * Stops as soon as the running count exceeds `limit`, so callers can reject oversized
 * strings without scanning them fully. Any returned value above `limit` means "over budget".
 * @param value String to count.
 * @param json Whether JSON quoting/escaping applies.
 * @param limit Remaining byte budget.
 * @returns Exact byte count, or a partial count already greater than `limit`.
 */
export function countWireString(value: string, json: boolean, limit: number): number {
  let bytes = json ? 2 : 0
  const length = value.length
  for (let index = 0; index < length && bytes <= limit; index++) {
    const code = value.charCodeAt(index)
    if (code < 128) {
      if (!json || (code >= 32 && code !== 34 && code !== 92)) bytes += 1
      // Short escapes: \" \\ \b \t \n \f \r; other C0 controls use \u00XX.
      else bytes += code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 2 : 6
    }
    else if (code < 2048) {
      bytes += 2
    }
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < length && isLowSurrogate(value.charCodeAt(index + 1))) {
      // Paired surrogates encode one 4-byte code point.
      bytes += 4
      index++
    }
    else {
      // Lone surrogates: JSON escapes as \uXXXX, UTF-8 replaces with 3-byte U+FFFD.
      bytes += json && code >= 0xD800 && code <= 0xDFFF ? 6 : 3
    }
  }
  return bytes
}

/** Whether a UTF-16 code unit is a trailing surrogate. */
function isLowSurrogate(code: number): boolean {
  return code >= 0xDC00 && code <= 0xDFFF
}
