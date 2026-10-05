import type { HistoireSettings } from '@histoire/protocol'
import type { HistoirePreferenceStorage } from '../adapters/types.js'
import { validateSettingsPatch } from '@histoire/protocol'
import { getHistoirePersistenceKey } from './key.js'

/** Lazy browser access occurs only after explicit persistence opt-in. */
function browserStorage(): HistoirePreferenceStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

/** Source-scoped settings persistence; failures retain in-memory preferences. */
export function createSettingsPersistence(url: string, key?: string, storage = browserStorage) {
  let disabled = key === undefined
  const namespace = key === undefined ? '' : getHistoirePersistenceKey(url, key)
  return {
    /** Read once during explicit connect; denied/malformed data never blocks it. */
    read(): Partial<HistoireSettings> {
      if (disabled) return {}
      try {
        const saved = storage()?.getItem(namespace)
        return saved ? validateSettingsPatch(JSON.parse(saved)) : {}
      }
      catch {
        disabled = true
        return {}
      }
    },
    /** Write only validated host-owned settings; no state or events persisted. */
    write(settings: HistoireSettings): void {
      if (disabled) return
      try {
        storage()?.setItem(namespace, JSON.stringify(settings))
      }
      catch { disabled = true }
    },
  }
}
