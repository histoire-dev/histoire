import { createHash } from 'node:crypto'
import { measureWireValue } from '@histoire/shared'

/** Digest bytes or independently serialized JSON, never filesystem labels. */
export function visualHash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Sorted JSON preserves types and rejects getters/non-JSON values before traversal. */
export function stableVisualJson(value: unknown, maxBytes = 64 * 1024): string {
  measureWireValue(value, { maxBytes })
  /** Sort recursively after getter-safe validation. */
  function ordered(item: any): any {
    if (Array.isArray(item)) {
      return item.map(ordered)
    }
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])]))
    }
    return item
  }
  return JSON.stringify(ordered(value))
}
