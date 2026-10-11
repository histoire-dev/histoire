/** Detached deep immutable public observations cannot rewrite approval evidence. */
export function visualSnapshot<T>(value: T): T {
  const copy = structuredClone(value)
  /** Recursively freeze JSON records, including result props. */
  function freeze(item: any): void {
    if (!item || typeof item !== 'object') {
      return
    }
    Object.values(item).forEach(freeze)
    Object.freeze(item)
  }
  freeze(copy)
  return copy
}
