import { toRaw } from '@histoire/vendors/vue'

/**
 * Detach initializer data while retaining callbacks and opaque instance owners.
 * Plain objects, arrays, dates, regular expressions, maps, sets, and binary data
 * are copied. Other instances retain their identity and runtime behavior.
 * Root back-references point to the existing variant state owner, not a spare copy.
 */
export function cloneInitialState<S extends Record<string, any>>(state: S, owner: Record<string, any>): S {
  const seen = new WeakMap<object, any>()

  /** Copy enumerable fields without invoking prototype setters on new objects. */
  function copyFields(source: Record<PropertyKey, any>, target: Record<PropertyKey, any>) {
    for (const key of Reflect.ownKeys(source)) {
      if (!Object.getOwnPropertyDescriptor(source, key)?.enumerable) continue
      Object.defineProperty(target, key, {
        value: copy(source[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
  }

  /** Unwrap each Vue proxy and copy each mutable owner once, preserving aliases. */
  function copy(value: any): any {
    if (value === null || typeof value !== 'object') return value
    const raw = toRaw(value)
    if (seen.has(raw)) return seen.get(raw)
    let result: any
    if (Array.isArray(raw)) {
      result = []
      result.length = raw.length
    }
    else if (raw instanceof Date) {
      result = new Date(raw.getTime())
    }
    else if (raw instanceof RegExp) {
      result = new RegExp(raw.source, raw.flags)
      result.lastIndex = raw.lastIndex
    }
    else if (raw instanceof Map) {
      result = new Map()
    }
    else if (raw instanceof Set) {
      result = new Set()
    }
    else if (raw instanceof ArrayBuffer) {
      result = raw.slice(0)
    }
    else if (ArrayBuffer.isView(raw)) {
      const buffer = copy(raw.buffer)
      result = raw instanceof DataView
        ? new DataView(buffer, raw.byteOffset, raw.byteLength)
        : new (raw.constructor as typeof Uint8Array)(buffer, raw.byteOffset, (raw as Uint8Array).length)
    }
    else {
      const prototype = Object.getPrototypeOf(raw)
      if (prototype !== Object.prototype && prototype !== null) return raw
      result = Object.create(prototype)
    }
    seen.set(raw, result)
    if (raw instanceof Map) {
      for (const [key, value] of raw) result.set(copy(key), copy(value))
    }
    else if (raw instanceof Set) {
      for (const value of raw) result.add(copy(value))
    }
    else if (!ArrayBuffer.isView(raw)) {
      copyFields(raw, result)
    }
    return result
  }

  if (state === null || typeof state !== 'object') return state
  const raw = toRaw(state)
  const result = {} as S
  seen.set(raw, owner)
  copyFields(raw, result)
  return result
}
