import type { HistoireWirePolicy } from './limits.js'
import { HistoireSdkError } from '../types/error.js'
import { getHistoireWireLimit, HISTOIRE_WIRE_LIMITS } from './limits.js'
import { countWireString } from './string-size.js'

/** Portable graph budget, distinct from browser-native structured-clone byte size. */
export interface HistoireWireSizeOptions {
  /** JSON DTOs repeat aliases; state graphs preserve cycles and cloneable primitives. */
  mode?: 'json' | 'state'
  /** Command-specific byte budget. */
  maxBytes?: number
  /** Maximum nesting depth. */
  maxDepth?: number
  /** Maximum visited containers/JSON occurrences. */
  maxContainers?: number
  /** Maximum property edges, including sparse array slots. */
  maxEdges?: number
}

/** Depth marker for a frame that releases its JSON ancestor after all children. */
const EXIT = -1

/** Throws a typed failure without including untrusted oversized data. */
function fail(code: 'INVALID_ARGUMENT' | 'RESULT_TOO_LARGE', message: string): never {
  throw new HistoireSdkError(code, message)
}

/** Keys that could mutate prototypes when a receiver assigns them. */
function isPrototypeKey(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor'
}

/** Reads an own data field without ever evaluating accessors or toJSON. */
function readField(value: object, key: string): unknown {
  if (isPrototypeKey(key)) fail('INVALID_ARGUMENT', 'Prototype-mutating keys are forbidden')
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor)) fail('INVALID_ARGUMENT', 'Accessors are forbidden in wire values')
  return descriptor.value
}

/** Exact `JSON.stringify(value).length` for a finite number, without allocating for safe integers. */
function jsonNumberLength(value: number): number {
  if (!Number.isSafeInteger(value)) return String(value).length
  // -0 is not < 0 and serializes as "0".
  let length = value < 0 ? 2 : 1
  for (let rest = Math.abs(value); rest >= 10; rest = Math.floor(rest / 10)) length++
  return length
}

/** Rejects a negative or non-integer budget. */
function checkBound(bound: number): void {
  if (!Number.isSafeInteger(bound) || bound < 0) fail('INVALID_ARGUMENT', 'Invalid wire budget')
}

/**
 * Counts and validates one bounded wire value, stopping before expensive allocation.
 * Traversal is iterative over two parallel stacks (value, depth) to avoid per-node frame
 * objects; an `EXIT` depth marks where a JSON container leaves the ancestry.
 */
export function measureWireValue(value: unknown, options: HistoireWireSizeOptions = {}): number {
  const json = options.mode !== 'state'
  const maxBytes = options.maxBytes ?? HISTOIRE_WIRE_LIMITS.request
  const maxDepth = options.maxDepth ?? HISTOIRE_WIRE_LIMITS.depth
  const maxContainers = options.maxContainers ?? HISTOIRE_WIRE_LIMITS.containers
  const maxEdges = options.maxEdges ?? HISTOIRE_WIRE_LIMITS.edges
  checkBound(maxBytes)
  checkBound(maxDepth)
  checkBound(maxContainers)
  checkBound(maxEdges)
  let bytes = 0
  let containers = 0
  let edges = 0
  // JSON mode tracks only the current ancestry (cycles); state mode tracks every visited
  // container (aliases counted once). One call-local Set serves either purpose.
  const seen = new Set<object>()
  const values: unknown[] = [value]
  const depths: number[] = [0]
  // Per-container scratch, overwritten (never truncated) for each container: field
  // values/enumerability captured by the single descriptor read so children are pushed
  // without a second descriptor lookup. Only indices below the container's key count are read.
  const fieldValues: unknown[] = []
  const fieldEnumerable: boolean[] = []
  /** Every increment checks budget before next traversal/allocation. */
  const charge = (amount: number) => {
    bytes += amount
    if (bytes > maxBytes) fail('RESULT_TOO_LARGE', 'Wire byte limit exceeded')
  }
  /** Sparse slots count as edges even though no property descriptor exists. */
  const chargeEdges = (amount: number) => {
    edges += amount
    if (edges > maxEdges) fail('RESULT_TOO_LARGE', 'Wire edge limit exceeded')
    if (!json) charge(amount * 8)
  }
  /** Charges one string; counting stops once it cannot fit the remaining budget. */
  const chargeString = (text: string, quoted: boolean) => {
    charge(countWireString(text, quoted, maxBytes - bytes))
  }
  while (values.length) {
    const current = values.pop()
    const depth = depths.pop()!
    if (depth === EXIT) {
      seen.delete(current as object)
      continue
    }
    if (depth > maxDepth) fail('RESULT_TOO_LARGE', 'Wire depth limit exceeded')
    if (typeof current === 'string') {
      chargeString(current, json)
      continue
    }
    if (current === null) {
      charge(json ? 4 : 1)
      continue
    }
    if (typeof current === 'boolean') {
      charge(json ? current ? 4 : 5 : 1)
      continue
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail('INVALID_ARGUMENT', 'Non-finite wire number')
      charge(json ? jsonNumberLength(current) : 8)
      continue
    }
    if (current === undefined && !json) {
      charge(1)
      continue
    }
    if (typeof current === 'bigint' && !json) {
      charge(8)
      const remaining = maxBytes - bytes
      const magnitude = current < 0n ? -current : current
      // Shift the input down instead of allocating a budget-sized sentinel;
      // Firefox cannot materialize that sentinel even for a small valid value.
      // Check magnitude before formatting, with exact signed byte boundaries.
      if ((magnitude >> (BigInt(remaining) * 8n)) !== 0n) fail('RESULT_TOO_LARGE', 'Wire BigInt limit exceeded')
      charge(magnitude === 0n ? 0 : Math.ceil(magnitude.toString(16).length / 2))
      continue
    }
    if (typeof current !== 'object' || current === null) fail('INVALID_ARGUMENT', 'Unsupported wire value')
    const array = Array.isArray(current)
    const prototype = Object.getPrototypeOf(current)
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('INVALID_ARGUMENT', 'Wire values must be plain containers')
    if (seen.has(current)) {
      if (json) fail('INVALID_ARGUMENT', 'Cycles are forbidden in JSON DTOs')
      continue
    }
    if (++containers > maxContainers) fail('RESULT_TOO_LARGE', 'Wire container limit exceeded')
    seen.add(current)
    if (array && current.length > maxEdges - edges) fail('RESULT_TOO_LARGE', 'Wire edge limit exceeded')
    // `getOwnPropertyNames` is much faster than `Reflect.ownKeys` in V8; symbols are
    // checked separately after this container, as before.
    const keys = Object.getOwnPropertyNames(current)
    const names = keys.length
    if (names - (array ? 1 : 0) > maxEdges - edges) fail('RESULT_TOO_LARGE', 'Wire edge limit exceeded')
    // Arrays list present indices ascending before `length` (created first among string keys).
    let indexCount = 0
    for (let position = 0; position < names; position++) {
      const key = keys[position]
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!
      if (!('value' in descriptor)) fail('INVALID_ARGUMENT', 'Accessors are forbidden in wire values')
      if (isPrototypeKey(key) || (key === 'toJSON' && typeof descriptor.value === 'function')) fail('INVALID_ARGUMENT', 'Forbidden wire serialization key')
      if (array && key === 'length') indexCount = position
      fieldValues[position] = descriptor.value
      fieldEnumerable[position] = descriptor.enumerable!
    }
    if (json) {
      values.push(current)
      depths.push(EXIT)
      charge(2)
    }
    else {
      charge(16)
    }
    const childDepth = depth + 1
    if (array) {
      chargeEdges(current.length)
      if (json && current.length) charge(current.length - 1)
      if (json && indexCount < current.length) fail('INVALID_ARGUMENT', 'Sparse arrays are forbidden in JSON DTOs')
      // Push descending so indices pop in ascending order.
      for (let position = indexCount - 1; position >= 0; position--) {
        values.push(fieldValues[position])
        depths.push(childDepth)
      }
      // Structured-clone arrays support data properties as well as slots;
      // JSON ignores extra properties, so reject them rather than hide data.
      for (let position = indexCount + 1; position < names; position++) {
        if (!fieldEnumerable[position]) continue
        if (json) fail('INVALID_ARGUMENT', 'Extra array fields are forbidden in JSON DTOs')
        chargeEdges(1)
        chargeString(keys[position], false)
        values.push(fieldValues[position])
        depths.push(childDepth)
      }
    }
    else {
      let first = true
      for (let position = 0; position < names; position++) {
        if (!fieldEnumerable[position]) continue
        chargeEdges(1)
        if (json) {
          charge(first ? 1 : 2)
          first = false
        }
        chargeString(keys[position], json)
        values.push(fieldValues[position])
        depths.push(childDepth)
      }
    }
    if (Object.getOwnPropertySymbols(current).length) fail('INVALID_ARGUMENT', 'Symbol keys are forbidden in wire values')
  }
  return bytes
}

/** Applies registry precedence; view.sync independently validates state/catalog fields. */
export function validateWireValue(value: unknown, policy: HistoireWirePolicy): number {
  const state = (policy.kind === 'request' || policy.kind === 'response' || policy.kind === 'event')
    && (policy.name === 'view.sync' || policy.name === 'state.patch' || policy.name === 'state.get' || policy.name === 'state.reset' || policy.name === 'state.changed')
  const bytes = measureWireValue(value, { mode: state ? 'state' : 'json', maxBytes: getHistoireWireLimit(policy) })
  if (policy.name === 'view.sync' && value && typeof value === 'object') {
    const snapshot = value as Record<string, unknown>
    if (Object.hasOwn(snapshot, 'catalog')) measureWireValue(readField(snapshot, 'catalog'), { maxBytes: HISTOIRE_WIRE_LIMITS.catalog })
    if (Object.hasOwn(snapshot, 'state')) measureWireValue(readField(snapshot, 'state'), { mode: 'state', maxBytes: HISTOIRE_WIRE_LIMITS.state })
  }
  return bytes
}
