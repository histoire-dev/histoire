import type { HistoireJsonValue } from '@histoire/protocol'
import { measureWireValue } from '@histoire/protocol'

/** Matrix edits share the isolated runtime's bounded JSON payload policy. */
export const MATRIX_VALUES_BYTES = 64 * 1024

/** Canonical containers make JSON object identity independent of insertion order. */
function canonical(value: HistoireJsonValue): HistoireJsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map(canonical)) as unknown as HistoireJsonValue[]
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])))
  return value === 0 ? 0 : value
}

/** Stable typed identity; JSON distinguishes strings, numbers, booleans and null. */
export function matrixValueKey(value: HistoireJsonValue): string {
  return JSON.stringify(canonical(value))
}

/** Filters and layout use structural equality after storage or runtime cloning. */
export function equalMatrixValue(left: HistoireJsonValue, right: HistoireJsonValue): boolean {
  return Object.is(left, right) || matrixValueKey(left) === matrixValueKey(right)
}

/** Scalars retain existing labels; containers expose complete compact JSON. */
export function formatMatrixValue(value: HistoireJsonValue): string {
  return value && typeof value === 'object' ? matrixValueKey(value) : String(value)
}

/** Validate every member before normalization, deduplication, or freezing. */
export function normalizeMatrixCustomValues(input: unknown): readonly HistoireJsonValue[] {
  if (!Array.isArray(input) || input.length > 64) throw new Error('Values must contain 2–64 distinct JSON values')
  measureWireValue(input, { maxBytes: MATRIX_VALUES_BYTES })
  const values = [...new Map(input.map((value) => {
    const normalized = canonical(value)
    return [JSON.stringify(normalized), normalized] as const
  })).values()]
  if (values.length < 2) throw new Error('Values must contain 2–64 distinct JSON values')
  return Object.freeze(values)
}

/** Parse JSON text, or return `fallback` when it is not valid JSON. */
function tryParseJson(input: string, fallback: unknown): unknown {
  try {
    return JSON.parse(input)
  }
  catch { return fallback }
}

/**
 * Authoring input holds one value per line. Each line is a JSON literal when
 * valid (`1`, `true`, `"1"`, `{"a":1}`), otherwise plain text. A complete JSON
 * array (pasted or pretty-printed) is accepted as the whole list.
 * Invalid drafts never partially apply.
 */
export function parseMatrixCustomValues(input: string): readonly HistoireJsonValue[] {
  const whole = tryParseJson(input, undefined)
  if (Array.isArray(whole)) return normalizeMatrixCustomValues(whole)
  const lines = input.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 2) throw new Error('Enter at least two values, one per line')
  return normalizeMatrixCustomValues(lines.map(line => tryParseJson(line, line)))
}

/** Inverse of `parseMatrixCustomValues`: plain text stays bare, ambiguous strings are quoted. */
export function formatMatrixCustomValues(values: readonly HistoireJsonValue[]): string {
  /** Strings that would not read back as the same plain text need JSON quotes. */
  const ambiguous = (value: string) => value !== value.trim() || !value || value.includes('\n') || tryParseJson(value, undefined) !== undefined
  const format = (quote: boolean) => values.map(value => typeof value === 'string' && !(quote || ambiguous(value)) ? value : matrixValueKey(value)).join('\n')
  const text = format(false)
  // Bare lines can join into a valid JSON array (`[1` + `2]`), which the
  // parser would read as a whole list; quote every string in that case.
  return Array.isArray(tryParseJson(text, undefined)) ? format(true) : text
}
