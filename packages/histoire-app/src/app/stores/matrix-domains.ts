import type { MatrixAxis, MatrixProp } from '../util/matrix.js'
import type { MatrixPreferences } from './matrix-preferences.js'
import { measureWireValue } from '@histoire/protocol'
import { MATRIX_VALUES_BYTES } from '../util/matrix-values.js'
import { expandMatrixCells, filterMatrixValues, resolveMatrixAxisPair } from '../util/matrix.js'
import { isNumericMatrixAxis } from './matrix-preferences.js'

/** Story domains reserve capacity, then local axes, then automatic candidates. */
export function composeMatrixAxes(defaults: readonly MatrixAxis[], props: readonly MatrixProp[], state: MatrixPreferences, hints: readonly string[]): MatrixAxis[] {
  const axes = new Map(defaults.map((axis) => {
    const values = state.numericValues?.[axis.name]
    return [axis.name, values && isNumericMatrixAxis(axis, props) ? { ...axis, values } : axis] as const
  }))
  for (const [name, values] of Object.entries(state.customAxes ?? {})) axes.set(name, { name, values })
  const priority = [...hints, ...Object.keys(state.customAxes ?? {}), ...axes.keys()]
  const retained = new Set([...new Set(priority)].filter(name => axes.has(name)).slice(0, 32))
  return [...axes.values()].filter(axis => retained.has(axis.name))
}

/** Partial selection exposes the first added axis before a second exists. */
export function resolveMatrixSelection(axes: readonly MatrixAxis[], requested: { rows?: string, cols?: string }, saved: { rows?: string, cols?: string }, hints: readonly string[]): { rows: string, cols: string } {
  const pair = resolveMatrixAxisPair(axes, requested, saved, hints)
  if (pair) return pair
  const name = axes.find(axis => axis.values.length >= 2)?.name ?? ''
  return saved.cols === name && saved.rows !== name ? { rows: '', cols: name } : { rows: name, cols: '' }
}

/** Filters belong to prop names and compare JSON structurally across reloads. */
export function matrixAxisPreferences(axes: readonly MatrixAxis[], rows: string, cols: string, previous: MatrixPreferences) {
  const filters = new Map([[previous.rows, previous.rowValues], [previous.cols, previous.colValues]])
  /** Reconcile only supplied filters; missing still means entire domain. */
  function subset(name: string) {
    const filter = filters.get(name)
    const axis = axes.find(axis => axis.name === name)
    return filter === undefined || !axis ? undefined : filterMatrixValues(axis, filter)
  }
  return { rows, cols, rowValues: subset(rows), colValues: subset(cols) }
}

/** Validate complete cell payloads before an atomic local preference publication. */
export function validateMatrixDomainEdit(storyId: string, axes: readonly MatrixAxis[], state: MatrixPreferences, base: Record<string, unknown>): void {
  measureWireValue(state.customAxes ?? {}, { maxBytes: MATRIX_VALUES_BYTES })
  const rows = axes.find(axis => axis.name === state.rows)
  const cols = axes.find(axis => axis.name === state.cols)
  const props = Object.fromEntries(Object.entries(base).filter(([name]) => name !== rows?.name && name !== cols?.name))
  if (rows && cols) {
    // Check whole domains, even if user hid a value, so toggling it cannot
    // later introduce a payload the isolated runtime would reject silently.
    for (const cell of expandMatrixCells(storyId, rows, cols, props)) measureWireValue(cell.props, { maxBytes: MATRIX_VALUES_BYTES })
  }
  else if (rows || cols) {
    const axis = rows ?? cols!
    for (const value of axis.values) measureWireValue({ ...props, [axis.name]: value }, { maxBytes: MATRIX_VALUES_BYTES })
  }
}
