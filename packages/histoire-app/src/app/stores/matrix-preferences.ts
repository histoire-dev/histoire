import type { MatrixAxis, MatrixProp, MatrixValue } from '../util/matrix.js'
import { getHistoireNumericMatrixValues, measureWireValue } from '@histoire/protocol'
import { MATRIX_VALUES_BYTES, normalizeMatrixCustomValues } from '../util/matrix-values.js'
import { isMatrixPropName } from '../util/matrix.js'

/** Saved per-story choices exclude transient selected cell and runtime owners. */
export interface MatrixPreferences {
  /** Row axis prop name. */
  rows: string
  /** Column axis prop name. */
  cols: string
  /** Optional row subset; empty means intentionally no cells. */
  rowValues?: readonly MatrixValue[]
  /** Optional column subset. */
  colValues?: readonly MatrixValue[]
  /** Explicit user overrides; preset defaults stay outside persisted state. */
  base: Record<string, unknown>
  /** Explicit numeric domain overrides keyed by prop, independent of axis position. */
  numericValues?: Record<string, readonly number[]>
  /** Explicit JSON axes also survive missing runtime metadata. */
  customAxes?: Record<string, readonly MatrixValue[]>
}

/** Optional storage port follows same caller ownership as shell. */
export interface MatrixStorage {
  /** Read preference JSON. */
  getItem: (key: string) => string | null
  /** Persist preference JSON. */
  setItem: (key: string, value: string) => void
}

/** Numeric domains are editable even when their author supplied no runtime type. */
export function isNumericMatrixAxis(axis: MatrixAxis, props: readonly MatrixProp[]): boolean {
  return Boolean(props.find(prop => prop.name === axis.name)?.numeric) || (axis.values.length > 0 && axis.values.every(value => typeof value === 'number' && Number.isFinite(value)))
}

/** Restore valid overrides independently; corrupt entries never erase other preferences. */
export function restoreMatrixNumericValues(input: unknown): Record<string, readonly number[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(Object.entries(input).flatMap(([name, input]) => {
    const values = getHistoireNumericMatrixValues(input)
    return isMatrixPropName(name) && values ? [[name, values]] : []
  }))
}

/** Corrupt entries are ignored individually, including combined payload overflow. */
function restoreCustomAxes(input: unknown): Record<string, readonly MatrixValue[]> {
  const result: Record<string, readonly MatrixValue[]> = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result
  for (const [name, values] of Object.entries(input)) {
    if (!isMatrixPropName(name) || name !== name.trim() || Object.keys(result).length >= 32) continue
    try {
      const normalized = normalizeMatrixCustomValues(values)
      measureWireValue({ ...result, [name]: normalized }, { maxBytes: MATRIX_VALUES_BYTES })
      result[name] = normalized
    }
    catch { /* Invalid entry cannot erase other saved preferences. */ }
  }
  return result
}

/** Restored filters accept valid JSON members without requiring a nonempty domain. */
function restoreFilter(input: unknown): readonly MatrixValue[] | undefined {
  if (!Array.isArray(input)) return
  return input.slice(0, 64).filter((value) => {
    try {
      measureWireValue(value, { maxBytes: MATRIX_VALUES_BYTES })
      return true
    }
    catch { return false }
  })
}

/** Old records remain compatible; each new preference field validates independently. */
export function restoreMatrixPreferences(saved?: Partial<MatrixPreferences>): MatrixPreferences {
  return {
    rows: typeof saved?.rows === 'string' ? saved.rows : '',
    cols: typeof saved?.cols === 'string' ? saved.cols : '',
    rowValues: restoreFilter(saved?.rowValues),
    colValues: restoreFilter(saved?.colValues),
    base: Object.fromEntries(Object.entries(saved?.base ?? {}).filter(([name]) => isMatrixPropName(name))),
    numericValues: restoreMatrixNumericValues(saved?.numericValues),
    customAxes: restoreCustomAxes(saved?.customAxes),
  }
}
