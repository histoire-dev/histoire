/** Isolated storage proves preference ownership without browser globals. */
export function memoryStorage() {
  const values = new Map<string, string>()
  return {
    /** Reads only this fixture's owned key. */
    getItem: (key: string) => values.get(key) ?? null,
    /** Replaces one serialized preference. */
    setItem: (key: string, value: string) => { values.set(key, value) },
    /** Clears one acknowledged override or receipt. */
    removeItem: (key: string) => { values.delete(key) },
  }
}
