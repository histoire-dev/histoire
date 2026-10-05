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

/** Iterative frame; exit removes JSON ancestry without losing repeated alias accounting. */
interface Frame {
  /** Current scalar/container without serialization. */
  value: unknown
  /** Captured path depth. */
  depth: number
  /** Releases JSON ancestor after all child frames. */
  exit?: boolean
}

/** Throws a typed failure without including untrusted oversized data. */
function fail(code: 'INVALID_ARGUMENT' | 'RESULT_TOO_LARGE', message: string): never {
  throw new HistoireSdkError(code, message)
}

/** Reads an own data field without ever evaluating accessors or toJSON. */
function readField(value: object, key: string): unknown {
  if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('INVALID_ARGUMENT', 'Prototype-mutating keys are forbidden')
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor)) fail('INVALID_ARGUMENT', 'Accessors are forbidden in wire values')
  return descriptor.value
}

/** Counts and validates one bounded wire value, stopping before expensive allocation. */
export function measureWireValue(value: unknown, options: HistoireWireSizeOptions = {}): number {
  const json = options.mode !== 'state'
  const maxBytes = options.maxBytes ?? HISTOIRE_WIRE_LIMITS.request
  const maxDepth = options.maxDepth ?? HISTOIRE_WIRE_LIMITS.depth
  const maxContainers = options.maxContainers ?? HISTOIRE_WIRE_LIMITS.containers
  const maxEdges = options.maxEdges ?? HISTOIRE_WIRE_LIMITS.edges
  for (const bound of [maxBytes, maxDepth, maxContainers, maxEdges]) {
    if (!Number.isSafeInteger(bound) || bound < 0) fail('INVALID_ARGUMENT', 'Invalid wire budget')
  }
  let bytes = 0
  let containers = 0
  let edges = 0
  const visited = new WeakSet<object>()
  const ancestry = new WeakSet<object>()
  const stack: Frame[] = [{ value, depth: 0 }]
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
  while (stack.length) {
    const frame = stack.pop()!
    const current = frame.value
    if (frame.exit) {
      ancestry.delete(current as object)
      continue
    }
    if (frame.depth > maxDepth) fail('RESULT_TOO_LARGE', 'Wire depth limit exceeded')
    if (typeof current === 'string') {
      countWireString(current, json, charge)
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
      charge(json ? JSON.stringify(current).length : 8)
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
    if (json && ancestry.has(current)) fail('INVALID_ARGUMENT', 'Cycles are forbidden in JSON DTOs')
    if (!json && visited.has(current)) continue
    if (++containers > maxContainers) fail('RESULT_TOO_LARGE', 'Wire container limit exceeded')
    visited.add(current)
    if (array && current.length > maxEdges - edges) fail('RESULT_TOO_LARGE', 'Wire edge limit exceeded')
    const names = Object.getOwnPropertyNames(current)
    if (names.length - (array ? 1 : 0) > maxEdges - edges) fail('RESULT_TOO_LARGE', 'Wire edge limit exceeded')
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!
      if (!('value' in descriptor)) fail('INVALID_ARGUMENT', 'Accessors are forbidden in wire values')
      if (['__proto__', 'prototype', 'constructor'].includes(key) || (key === 'toJSON' && typeof descriptor.value === 'function')) fail('INVALID_ARGUMENT', 'Forbidden wire serialization key')
    }
    if (json) {
      ancestry.add(current)
      stack.push({ ...frame, exit: true })
      charge(2)
    }
    else {
      charge(16)
    }
    if (array) {
      chargeEdges(current.length)
      if (json && current.length) charge(current.length - 1)
      for (let index = current.length - 1; index >= 0; index--) {
        const key = String(index)
        if (!Object.hasOwn(current, key)) {
          if (json) fail('INVALID_ARGUMENT', 'Sparse arrays are forbidden in JSON DTOs')
          continue
        }
        stack.push({ value: readField(current, key), depth: frame.depth + 1 })
      }
      // Structured-clone arrays support data properties as well as slots;
      // JSON ignores extra properties, so reject them rather than hide data.
      for (const key in current) {
        if (!Object.hasOwn(current, key) || (/^(?:0|[1-9]\d*)$/.test(key) && Number(key) < current.length)) continue
        if (json) fail('INVALID_ARGUMENT', 'Extra array fields are forbidden in JSON DTOs')
        chargeEdges(1)
        countWireString(key, false, charge)
        stack.push({ value: readField(current, key), depth: frame.depth + 1 })
      }
    }
    else {
      let first = true
      for (const key in current) {
        if (!Object.hasOwn(current, key)) continue
        chargeEdges(1)
        if (json) {
          charge(first ? 1 : 2)
          first = false
        }
        countWireString(key, json, charge)
        stack.push({ value: readField(current, key), depth: frame.depth + 1 })
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
