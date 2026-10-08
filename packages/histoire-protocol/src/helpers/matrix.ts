import type { HistoireMatrixRange } from './matrix-numeric.js'
import { getHistoireMatrixRangeValues } from './matrix-numeric.js'

/** Serializable finite prop value supported by matrix axes. */
export type HistoireMatrixValue = string | number | boolean | null

/** Optional additive metadata for frameworks without runtime enum definitions. */
export interface HistoireMatrixHint {
  /** Ordered finite values keyed by exact component prop name. */
  axes: Record<string, readonly HistoireMatrixValue[]>
}

/** Story authoring input; ranges become arrays before catalog publication. */
export interface HistoireMatrixDeclaration {
  /** Ordered values or numeric ranges keyed by exact prop name. */
  axes: Record<string, readonly HistoireMatrixValue[] | HistoireMatrixRange>
}

/** Matrix names never select internal controls or prototype properties. */
export function isHistoireMatrixPropName(name: string): boolean {
  return Boolean(name) && !name.startsWith('_h') && !['__proto__', 'prototype', 'constructor'].includes(name)
}

/** Normalize bounded finite scalars without evaluating validators or source code. */
export function getHistoireMatrixValues(value: unknown): HistoireMatrixValue[] | undefined {
  if (!Array.isArray(value)) return
  const values = value.filter((item): item is HistoireMatrixValue => item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))).map(item => item === 0 ? 0 : item)
  return [...new Map(values.map(item => [JSON.stringify([typeof item, item]), item])).values()].slice(0, 64)
}

/** Automatic domains must describe their complete finite set, never a sanitized subset. */
export function getHistoireFiniteMatrixValues(value: unknown): HistoireMatrixValue[] | undefined {
  if (!Array.isArray(value) || value.length > 64 || value.some(item => getHistoireMatrixValues([item])?.length !== 1)) return
  return getHistoireMatrixValues(value)
}

/** Project untrusted declaration data to immutable portable catalog metadata. */
export function normalizeHistoireMatrixHint(value: unknown): HistoireMatrixHint | undefined {
  if (!value || typeof value !== 'object') return
  const input = (value as { axes?: unknown }).axes
  if (!input || typeof input !== 'object' || Array.isArray(input)) return
  const axes = Object.fromEntries(Object.entries(input).filter(([name]) => isHistoireMatrixPropName(name)).map(([name, values]) => [name, Array.isArray(values) ? getHistoireMatrixValues(values) : getHistoireMatrixRangeValues(values)]).filter(([, values]) => Array.isArray(values) && values.length).slice(0, 32))
  if (!Object.keys(axes).length) return
  for (const values of Object.values(axes)) Object.freeze(values)
  return Object.freeze({ axes: Object.freeze(axes) })
}
