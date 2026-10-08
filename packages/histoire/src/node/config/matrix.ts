import { getHistoireNumericMatrixValues, HISTOIRE_MATRIX_NUMERIC_VALUES } from '@histoire/protocol'

/** Resolve numeric samples once for config processing and portable descriptors. */
export function resolveMatrixNumericValues(input: unknown): number[] {
  if (input === undefined) return [...HISTOIRE_MATRIX_NUMERIC_VALUES]
  const values = getHistoireNumericMatrixValues(input)
  if (!values) throw new Error('Histoire config: ui.matrix.numericValues must contain 2–64 distinct finite numbers')
  return values
}
