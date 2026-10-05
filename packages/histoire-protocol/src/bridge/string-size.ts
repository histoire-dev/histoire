/** Counts UTF-8 bytes incrementally; JSON escaping includes well-formed lone surrogates. */
export function countWireString(value: string, json: boolean, charge: (bytes: number) => void): void {
  if (json) charge(2)
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (json && (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code))) {
      charge(2)
    }
    else if (json && code < 32) {
      charge(6)
    }
    else if (code < 128) {
      charge(1)
    }
    else if (code < 2048) {
      charge(2)
    }
    else if (code >= 0xD800 && code <= 0xDBFF && value.charCodeAt(index + 1) >= 0xDC00 && value.charCodeAt(index + 1) <= 0xDFFF) {
      charge(4)
      index++
    }
    else {
      charge(json && code >= 0xD800 && code <= 0xDFFF ? 6 : 3)
    }
  }
}
