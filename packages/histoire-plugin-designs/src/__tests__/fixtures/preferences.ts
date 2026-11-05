import type { HistoireJsonValue } from '@histoire/protocol'

/**
 * In-memory plugin preferences double; `values` exposes the stored entries.
 */
export function createPreferences() {
  const values = new Map<string, HistoireJsonValue>()
  const preferences = {
    get: (key: string, fallback: HistoireJsonValue) => values.get(key) ?? fallback,
    set: (key: string, value: HistoireJsonValue) => void values.set(key, value),
  }
  return { preferences, values }
}
