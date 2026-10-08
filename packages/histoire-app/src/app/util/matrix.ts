import type { HistoireJsonValue } from '@histoire/protocol'
import { getHistoireFiniteMatrixValues, HISTOIRE_MATRIX_NUMERIC_VALUES, isHistoireMatrixPropName, normalizeHistoireMatrixHint } from '@histoire/protocol'
import { equalMatrixValue, matrixValueKey } from './matrix-values.js'

/** Finite scalar values have stable identity across URL/storage/runtime boundaries. */
export type MatrixValue = HistoireJsonValue

/** A discoverable prop with an explicit finite domain. */
export interface MatrixAxis {
  /** Exact prop name. */
  name: string
  /** Ordered finite values. */
  values: readonly MatrixValue[]
}

/** A Cartesian cell remains local; it is never a catalog variant. */
export interface MatrixCellData {
  /** Stable typed axes identity independent of base props. */
  key: string
  /** Selected row value. */
  row: MatrixValue
  /** Selected column value. */
  col: MatrixValue
  /** Complete merged props for isolated preview. */
  props: Record<string, unknown>
}

/** Useful editable base-prop metadata discovered without executing source code. */
export interface MatrixProp {
  /** Exact prop name. */
  name: string
  /** Current canonical/default value. */
  value: unknown
  /** Runtime type for editor selection. */
  type: string
  /** Exclusive numeric declaration or finite unowned root numeric state. */
  numeric?: boolean
}

/** User-provided property names cannot select internal/prototype state. */
export const isMatrixPropName = isHistoireMatrixPropName

/** Only record state carries named props; array-root state remains valid SDK data. */
export function getMatrixState(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}
}

/** Read structural auto-prop definitions safely from cleaned runtime state. */
function components(definitions: unknown): { index?: number, props: { name: string, types?: string[], values?: unknown, value?: unknown, default?: unknown }[] }[] {
  if (!Array.isArray(definitions)) return []
  return definitions.filter(item => item && Array.isArray(item.props)).map(component => ({
    index: Number.isSafeInteger(component.index) ? component.index : 0,
    props: component.props.filter(prop => prop && typeof prop.name === 'string').map(prop => ({
      name: prop.name,
      types: Array.isArray(prop.types) ? prop.types.filter(type => typeof type === 'string') : [],
      values: prop.values,
      ...(Object.hasOwn(prop, 'value') ? { value: prop.value } : {}),
      default: prop.default,
    })),
  }))
}

/** Numeric sampling can be disabled when capturing source-owned finite metadata. */
interface MatrixDiscoveryOptions {
  /** Project samples; false retains only complete finite runtime domains. */
  numericValues?: readonly number[] | false
}

/** Finite definitions, numeric samples and explicit story hints define axes. */
export function discoverMatrixAxes(definitions: unknown, hint?: { axes?: Record<string, unknown> }, state?: unknown, options: MatrixDiscoveryOptions = {}): MatrixAxis[] {
  const numericValues = options.numericValues === false ? undefined : options.numericValues ?? HISTOIRE_MATRIX_NUMERIC_VALUES
  const axes = new Map<string, MatrixAxis>()
  const owners = new Set<string>()
  const hintedNames = new Set<string>()
  for (const component of components(definitions)) {
    for (const prop of component.props) {
      if (!isMatrixPropName(prop.name) || owners.has(prop.name)) continue
      owners.add(prop.name)
      let values: readonly MatrixValue[] | undefined = getHistoireFiniteMatrixValues(prop.values)
      if (!values && prop.types?.length) {
        if (prop.types.every(type => type === 'boolean')) values = [false, true]
        else if (prop.types.every(type => type === 'number')) values = numericValues
      }
      if (values?.length) axes.set(prop.name, { name: prop.name, values })
    }
  }
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(getMatrixState(state)))) {
    if (!descriptor.enumerable || !isMatrixPropName(name) || owners.has(name)) continue
    if (typeof descriptor.value === 'boolean') axes.set(name, { name, values: [false, true] })
    else if (typeof descriptor.value === 'number' && Number.isFinite(descriptor.value) && numericValues) axes.set(name, { name, values: numericValues })
  }
  for (const [name, values] of Object.entries(normalizeHistoireMatrixHint(hint)?.axes ?? {})) {
    if (isMatrixPropName(name) && values?.length) {
      axes.set(name, { name, values })
      hintedNames.add(name)
    }
  }
  // Explicit domains reserve capacity before automatic overflow is discarded,
  // while the returned order still follows normal component traversal.
  const hints = [...hintedNames].slice(0, 32)
  const automatic = [...axes.keys()].filter(name => !hintedNames.has(name)).slice(0, 32 - hints.length)
  const retained = new Set([...hints, ...automatic])
  return [...axes.values()].filter(axis => retained.has(axis.name))
}

/** Independently valid URL axes win, then saved choices, explicit hints and small domains. */
export function resolveMatrixAxisPair(axes: readonly MatrixAxis[], requested: { rows?: string, cols?: string } = {}, saved: { rows?: string, cols?: string } = {}, hinted: readonly string[] = []): { rows: string, cols: string } | undefined {
  const usable = axes.filter(axis => axis.values.length >= 2)
  if (usable.length < 2) return
  const names = new Set(usable.map(axis => axis.name))
  const requestedRows = names.has(requested.rows ?? '') ? requested.rows : undefined
  const requestedCols = names.has(requested.cols ?? '') && requested.cols !== requestedRows ? requested.cols : undefined
  let rows = requestedRows ?? (names.has(saved.rows ?? '') && saved.rows !== requestedCols ? saved.rows : undefined)
  let cols = requestedCols ?? (names.has(saved.cols ?? '') && saved.cols !== rows ? saved.cols : undefined)
  const fallback = [...hinted.filter(name => names.has(name)), ...[...usable].sort((a, b) => a.values.length - b.values.length).map(axis => axis.name)]
  rows ??= fallback.find(name => name !== cols)
  cols ??= fallback.find(name => name !== rows)
  return rows && cols ? { rows, cols } : undefined
}

/** Base editing uses first component owner, matching additive runtime overrides. */
export function discoverMatrixProps(input: unknown = {}): MatrixProp[] {
  const state = getMatrixState(input)
  const props = new Map<string, MatrixProp>()
  const overrides = state._hPropState as Record<string, Record<string, unknown>> | undefined
  for (const component of components(state._hPropDefs)) {
    for (const prop of component.props) {
      if (!isMatrixPropName(prop.name) || props.has(prop.name)) continue
      const owner = overrides?.[String(component.index ?? 0)]
      // Frameworks serialize factories as source text. That text is metadata,
      // never an actual Object/Array default or something discovery may execute.
      const structured = prop.types?.length && prop.types.every(type => type === 'object' || type === 'array')
      const fallback = structured && prop.default !== null && typeof prop.default !== 'object' ? undefined : prop.default
      const value = owner && Object.hasOwn(owner, prop.name) ? owner[prop.name] : Object.hasOwn(prop, 'value') ? prop.value : Object.hasOwn(state, prop.name) ? state[prop.name] : fallback
      props.set(prop.name, { name: prop.name, value, type: prop.types?.[0] ?? typeof value, ...(prop.types?.length && prop.types.every(type => type === 'number') ? { numeric: true } : {}) })
    }
  }
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(state))) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) continue
    const value = descriptor.value
    if (isMatrixPropName(name) && !props.has(name)) props.set(name, { name, value, type: typeof value, ...(typeof value === 'number' && Number.isFinite(value) ? { numeric: true } : {}) })
  }
  return [...props.values()]
}

/** Typed JSON key avoids collisions such as number 1 and string "1". */
export function matrixCellKey(storyId: string, rows: string, row: MatrixValue, cols: string, col: MatrixValue): string {
  return `[${JSON.stringify(storyId)},${JSON.stringify(rows)},${matrixValueKey(row)},${JSON.stringify(cols)},${matrixValueKey(col)}]`
}

/** Missing filter means all values; empty filter intentionally means no cells. */
export function filterMatrixValues(axis: MatrixAxis, filter?: readonly MatrixValue[]): readonly MatrixValue[] {
  return filter === undefined ? axis.values : axis.values.filter(value => filter.some(item => equalMatrixValue(item, value)))
}

/** Axis props override shared base props, without mutating either input. */
export function expandMatrixCells(storyId: string, rows: MatrixAxis, cols: MatrixAxis, base: Record<string, unknown>, rowFilter?: readonly MatrixValue[], colFilter?: readonly MatrixValue[]): MatrixCellData[] {
  return filterMatrixValues(rows, rowFilter).flatMap(row => filterMatrixValues(cols, colFilter).map(col => ({
    key: matrixCellKey(storyId, rows.name, row, cols.name, col),
    row,
    col,
    props: { ...structuredClone(base), [rows.name]: structuredClone(row), [cols.name]: structuredClone(col) },
  })))
}

/** Wrap framework-generated markup without writing project source files. */
export function matrixVariantSnippet(title: string, source: string, tag: 'Variant' | 'Hst.Variant' = 'Variant'): string {
  let escaped = title.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  // Svelte interpolates braces inside quoted attributes; entities preserve literal collected titles.
  if (tag === 'Hst.Variant') escaped = escaped.replaceAll('{', '&#123;').replaceAll('}', '&#125;')
  return `<${tag} title="${escaped}">\n${source.split('\n').map(line => `  ${line}`).join('\n')}\n</${tag}>`
}
