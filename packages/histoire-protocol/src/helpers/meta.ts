import type { HistoireJsonValue } from '../types/common.js'
import { HISTOIRE_META_LIMITS } from '../bridge/limits.js'
import { countWireString } from '../bridge/string-size.js'

/**
 * Portable story/variant `meta` published in the catalog for workbench plugins: frozen JSON
 * values. Values are typed `unknown` because recursive JSON types are too deep for snapshot
 * readonly mapping; consumers validate the keys they own.
 */
export type HistoireMeta = Readonly<Record<string, unknown>>

/** Outcome of {@link normalizeHistoireMeta}. */
export interface HistoireMetaResult {
  /** Frozen JSON copy; absent when nothing JSON remained or the copy was abandoned. */
  meta?: HistoireMeta
  /** The copy exceeded `HISTOIRE_META_LIMITS` bytes or nodes and was abandoned. */
  tooLarge?: true
  /** Upper bound of the JSON bytes of `meta`. */
  bytes?: number
  /** JSON values (containers and leaves) in `meta`. */
  nodes?: number
}

/** Keys never copied: they could poison prototypes of consumers merging metadata. */
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Thrown inside the copy once a budget is exceeded, unwinding the recursion at once. */
const OVER_BUDGET = Symbol('over budget')

/** Running totals of one copy. */
interface CopyBudget {
  /** JSON bytes charged so far. */
  bytes: number
  /** JSON values copied so far. */
  nodes: number
  /** Containers on the current path, used to cut cycles. */
  ancestors: Set<object>
}

/**
 * Whether a value is an object literal (or `Object.create(null)`); class instances, dates,
 * components and arrays are excluded.
 * @param value Candidate.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Adds JSON bytes to the copy, abandoning it past the per-meta byte bound.
 * @param budget Running totals.
 * @param amount Bytes to add.
 */
function charge(budget: CopyBudget, amount: number): void {
  budget.bytes += amount
  if (budget.bytes > HISTOIRE_META_LIMITS.bytes) throw OVER_BUDGET
}

/**
 * Counts one copied JSON value, abandoning the copy past the per-meta node bound.
 * @param budget Running totals.
 */
function countNode(budget: CopyBudget): void {
  if (++budget.nodes > HISTOIRE_META_LIMITS.nodes) throw OVER_BUDGET
}

/**
 * Deep-copies one value keeping only JSON data. Returns `undefined` for values JSON cannot
 * carry (functions, symbols, non-finite numbers, class instances), for cyclic references and
 * for values deeper than `HISTOIRE_META_LIMITS.depth`. Shared references are copied (and
 * charged) once per occurrence, like `JSON.stringify` would, so DAGs hit the node bound early.
 * @param value Collected value.
 * @param depth Nesting depth of `value` (root is 0).
 * @param budget Running totals; throws {@link OVER_BUDGET} when exceeded.
 */
function copyJson(value: unknown, depth: number, budget: CopyBudget): HistoireJsonValue | undefined {
  if (depth > HISTOIRE_META_LIMITS.depth || (typeof value === 'number' && !Number.isFinite(value))) return
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    countNode(budget)
    charge(budget, typeof value === 'string' ? countWireString(value, true, HISTOIRE_META_LIMITS.bytes - budget.bytes) : String(value).length)
    return value
  }
  if (!value || typeof value !== 'object' || budget.ancestors.has(value)) return
  if (!Array.isArray(value) && !isPlainObject(value)) return
  countNode(budget)
  const container: object = value
  budget.ancestors.add(container)
  // Brackets now; per kept entry below a `,` (plus key and `:` for objects): an upper bound of JSON.
  charge(budget, 2)
  let result: HistoireJsonValue
  if (Array.isArray(container)) {
    const items: HistoireJsonValue[] = []
    for (const item of container) {
      const copy = copyJson(item, depth + 1, budget)
      if (copy === undefined) continue
      charge(budget, 1)
      items.push(copy)
    }
    result = Object.freeze(items) as HistoireJsonValue[]
  }
  else {
    const record: Record<string, HistoireJsonValue> = {}
    for (const [key, item] of Object.entries(container)) {
      if (UNSAFE_KEYS.has(key)) continue
      const copy = copyJson(item, depth + 1, budget)
      if (copy === undefined) continue
      charge(budget, countWireString(key, true, HISTOIRE_META_LIMITS.bytes - budget.bytes) + 2)
      record[key] = copy
    }
    result = Object.freeze(record)
  }
  budget.ancestors.delete(container)
  return result
}

/**
 * Projects collected `meta` to immutable JSON data without evaluating it. Non-JSON entries
 * (callbacks, components), cycles and values deeper than `HISTOIRE_META_LIMITS.depth` are
 * dropped; an empty or non-object result has no `meta`. The copy stops as soon as it exceeds
 * `HISTOIRE_META_LIMITS` bytes or nodes and reports `tooLarge`, so callers can warn.
 * @param value Story or variant `meta` as collected.
 */
export function normalizeHistoireMeta(value: unknown): HistoireMetaResult {
  if (!isPlainObject(value)) return {}
  const budget: CopyBudget = { bytes: 0, nodes: 0, ancestors: new Set() }
  let copy: Record<string, HistoireJsonValue>
  try {
    copy = copyJson(value, 0, budget) as Record<string, HistoireJsonValue>
  }
  catch (error) {
    if (error === OVER_BUDGET) return { tooLarge: true }
    throw error
  }
  return Object.keys(copy).length ? { meta: copy, bytes: budget.bytes, nodes: budget.nodes } : {}
}
