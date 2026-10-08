/** Built-in samples for open numeric props; these are not complete prop domains. */
export const HISTOIRE_MATRIX_NUMERIC_VALUES: readonly number[] = Object.freeze([0, 1, 2, 5, 10])

/** Declarative increasing numeric samples, bounded by an inclusive maximum. */
export interface HistoireMatrixRange {
  /** First value. */
  min: number
  /** Inclusive upper bound; an off-step endpoint is not appended. */
  max: number
  /** Positive interval between values. */
  step: number
}

/** Validate a complete numeric list without silently dropping invalid members. */
export function getHistoireNumericMatrixValues(input: unknown): number[] | undefined {
  if (!Array.isArray(input) || input.length > 64) return
  // Array iteration materializes holes, so sparse authoring arrays cannot
  // sneak undefined samples past the complete-domain validation.
  const items = Array.from(input)
  if (items.some(value => typeof value !== 'number' || !Number.isFinite(value))) return
  const values = [...new Set(items.map(value => value === 0 ? 0 : value))]
  return values.length >= 2 ? values : undefined
}

/** Exact integer coefficient and decimal scale for a finite number's canonical text. */
function decimal(value: number): { coefficient: bigint, scale: number } {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  const fraction = mantissa.split('.')[1]?.length ?? 0
  return { coefficient: BigInt(mantissa.replace('.', '')), scale: fraction - Number(exponent) }
}

/** Expand decimal ranges exactly before converting each bounded result to Number. */
export function getHistoireMatrixRangeValues(input: unknown): number[] | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return
  const { min, max, step } = input as HistoireMatrixRange
  if ([min, max, step].some(value => typeof value !== 'number' || !Number.isFinite(value)) || min > max || step <= 0) return
  const decimals = [min, max, step].map(decimal)
  const scale = Math.max(...decimals.map(value => value.scale))
  // Shared decimal scaling avoids accumulated floating-point drift and permits
  // count rejection before allocating values, even for extremely small steps.
  const [start, end, interval] = decimals.map(value => value.coefficient * 10n ** BigInt(scale - value.scale))
  const count = (end - start) / interval + 1n
  if (count > 64n) return
  const values = Array.from({ length: Number(count) }, (_, index) => Number(`${start + BigInt(index) * interval}e${-scale}`))
  return [...new Set(values.map(value => value === 0 ? 0 : value))]
}

/** Infer range inputs only if exact decimal expansion reproduces the entire domain. */
export function getHistoireMatrixRange(input: readonly number[]): HistoireMatrixRange | undefined {
  if (!getHistoireNumericMatrixValues(input)) return
  const decimals = input.slice(0, 2).map(decimal)
  const scale = Math.max(...decimals.map(value => value.scale))
  const [first, second] = decimals.map(value => value.coefficient * 10n ** BigInt(scale - value.scale))
  const range = { min: input[0], max: input[input.length - 1], step: Number(`${second - first}e${-scale}`) }
  const values = getHistoireMatrixRangeValues(range)
  return values?.length === input.length && values.every((value, index) => value === input[index]) ? range : undefined
}
