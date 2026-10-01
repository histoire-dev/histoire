/** State containers received through the serializable iframe bridge. */
type StateContainer = Record<string, any> | any[]

/** Returns whether a value can contain fields that need reconciliation. */
function isContainer(value: unknown): value is StateContainer {
  return value !== null && typeof value === 'object'
}

/**
 * Applies serializable fields without replacing runtime-owned objects or callbacks.
 * Unlike local applyState, the source has lost functions and prototypes in transit:
 * assigning a whole nested object or array would erase those values in the iframe.
 * Returns whether any reactive field changed, so an unchanged snapshot arms no echo guard.
 */
export function applySerializedState(target: StateContainer, source: StateContainer) {
  const seen = new WeakMap<object, StateContainer>()
  let changed = false

  /** Writes one field, preserving the existing tolerance for readonly story state. */
  function assign(container: StateContainer, key: string | number, value: any) {
    if (Object.is(container[key], value)) return
    try {
      container[key] = value
      changed = true
    }
    catch {
      // A readonly property still belongs to the story that created it.
    }
  }

  /** Reconciles one field, retaining the target's local identity and prototype. */
  function mergeField(container: StateContainer, key: string | number, value: any, replaceMissing: boolean) {
    if (!isContainer(value)) {
      assign(container, key, value)
      return
    }
    if (seen.has(value)) {
      assign(container, key, seen.get(value))
      return
    }
    const current = container[key]
    const compatible = isContainer(current) && Array.isArray(current) === Array.isArray(value)
    const next = compatible ? current : Array.isArray(value) ? [] : {}
    merge(next, value, replaceMissing)
    if (!compatible) assign(container, key, next)
  }

  /** Walks a snapshot once, including cycles and arrays containing omitted functions. */
  function merge(current: StateContainer, incoming: StateContainer, replaceMissing = false) {
    seen.set(incoming, current)
    if (Array.isArray(current) && Array.isArray(incoming)) {
      // toRawDeep(clean=true) omits array functions. Keep these local entries and
      // align incoming values with the remaining positions instead of shifting callbacks.
      const positions = current.flatMap((value, index) => typeof value === 'function' ? [] : [index])
      for (let index = 0; index < incoming.length; index++) {
        // Array entries are complete snapshots, not partial object patches.
        // Drop deleted serializable fields while retaining omitted callbacks.
        mergeField(current, positions[index] ?? current.length, incoming[index], true)
      }
      for (const index of positions.slice(incoming.length).reverse()) {
        current.splice(index, 1)
        changed = true
      }
      return
    }
    for (const key of Object.keys(incoming)) {
      // Never write prototype setters when handling data from another frame.
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      mergeField(current, key, incoming[key], replaceMissing || key.startsWith('_h'))
    }
    if (replaceMissing) {
      // Derived _h control metadata historically replaces old values. Remove
      // stale serializable fields while retaining callbacks omitted in transit.
      for (const key of Object.keys(current)) {
        if (Object.hasOwn(incoming, key) || typeof current[key] === 'function') continue
        try {
          if (delete current[key]) changed = true
        }
        catch {
          // Readonly metadata remains owned by its runtime.
        }
      }
    }
  }

  if (isContainer(target) && isContainer(source)) merge(target, source)
  return changed
}
