/** Exposes a detached immutable Map view, including mutation-safe forEach callbacks. */
export function immutableMap<K, V>(values: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const entries = new Map(values)
  const view: ReadonlyMap<K, V> = {
    get size() { return entries.size },
    get: key => entries.get(key),
    has: key => entries.has(key),
    entries: () => entries.entries(),
    keys: () => entries.keys(),
    values: () => entries.values(),
    [Symbol.iterator]: () => entries[Symbol.iterator](),
    forEach: callback => entries.forEach((value, key) => callback(value, key, view)),
  }
  return Object.freeze(view)
}
