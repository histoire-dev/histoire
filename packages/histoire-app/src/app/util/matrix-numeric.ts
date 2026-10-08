import { getHistoireNumericMatrixValues } from '@histoire/protocol'

/** Parse a complete decimal/scientific token; blank or JavaScript syntax is invalid. */
export function parseMatrixNumber(input: string): number | undefined {
  const text = input.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return
  const value = Number(text)
  return Number.isFinite(value) ? value === 0 ? 0 : value : undefined
}

/** Validate the entire list before publishing any numeric matrix changes. */
export function parseMatrixNumericValues(input: string): number[] {
  const tokens = input.split(',')
  const parsed = tokens.map(parseMatrixNumber)
  if (parsed.includes(undefined)) throw new Error('Enter comma-separated finite numbers')
  const values = getHistoireNumericMatrixValues(parsed)
  if (!values) throw new Error('Values must contain 2–64 distinct finite numbers')
  return values
}
