import { HistoireSdkError } from '@histoire/protocol'
import { toRawDeep } from '../util/state.js'

/** Mutable command projection; only explicitly edited branches become runtime intent. */
export function createEditableCommandState(initial: Readonly<Record<string, unknown>> | readonly unknown[]) {
  const value = structuredClone(initial)
  const proxies = new WeakMap<object, object>()
  const edits: string[][] = []
  /** Reject structural/derived mutations before they enter the finite state patch. */
  function check(key: string, path: string[]) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || (!path.length && key === '_hPropDefs')) {
      throw new HistoireSdkError('INVALID_ARGUMENT', 'Command cannot edit prototype or derived control definitions.')
    }
  }
  /** A parent edit subsumes children; arrays must publish their complete edited branch. */
  function mark(path: string[]) {
    if (edits.some(parent => parent.length <= path.length && parent.every((key, index) => key === path[index]))) return
    for (let index = edits.length - 1; index >= 0; index--) {
      if (path.every((key, part) => key === edits[index][part])) edits.splice(index, 1)
    }
    edits.push(path)
  }
  /** Cached proxies retain cyclic references; array methods still mutate normal array targets. */
  function wrap(target: object, path: string[], arrayPath?: string[]): object {
    const cached = proxies.get(target)
    if (cached) return cached
    const owner = arrayPath ?? (Array.isArray(target) ? path : undefined)
    const proxy = new Proxy(target, {
      get(target, key, receiver) {
        const current = Reflect.get(target, key, receiver)
        return current && typeof current === 'object' && typeof key === 'string' ? wrap(current, [...path, key], owner) : current
      },
      set(target, key, current) {
        if (typeof key !== 'string') throw new HistoireSdkError('INVALID_ARGUMENT', 'Command state keys must be strings.')
        check(key, path)
        const written = Reflect.set(target, key, current, target)
        if (written) mark(owner ?? [...path, key])
        return written
      },
      defineProperty(target, key, descriptor) {
        if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || descriptor.get || descriptor.set) {
          throw new HistoireSdkError('INVALID_ARGUMENT', 'Command state properties must contain plain values.')
        }
        check(key, path)
        const written = Reflect.defineProperty(target, key, descriptor)
        if (written) mark(owner ?? [...path, key])
        return written
      },
      deleteProperty(target, key) {
        if (!owner) throw new HistoireSdkError('INVALID_ARGUMENT', 'Object property deletion is unavailable through state.patch.')
        const deleted = Reflect.deleteProperty(target, key)
        if (deleted) mark(owner)
        return deleted
      },
      setPrototypeOf() { throw new HistoireSdkError('INVALID_ARGUMENT', 'Command cannot replace state prototypes.') },
    })
    proxies.set(target, proxy)
    return proxy
  }
  /** Reuse canonical serializer; untouched sibling fields never overwrite newer user edits. */
  function patch(): Record<string, unknown> | null {
    if (!edits.length) return null
    if (Array.isArray(value)) throw new HistoireSdkError('INVALID_ARGUMENT', 'Command state.patch requires an object root.')
    const result: Record<string, unknown> = {}
    for (const path of edits) {
      let destination = result
      let source: any = value
      for (let index = 0; index < path.length - 1; index++) {
        const key = path[index]
        source = source[key]
        destination = (destination[key] ??= {}) as Record<string, unknown>
      }
      const key = path.at(-1)!
      destination[key] = source[key]
    }
    return toRawDeep(result, true)
  }
  return { value: wrap(value, []), patch }
}
