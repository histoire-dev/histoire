import type { HistoireTarget } from '@histoire/protocol'
import type { RuntimePresetPersistence, RuntimePresetStorageSnapshot } from '../../embed/adapters/state-presets.js'
import { validateWireValue } from '@histoire/protocol'

/** Minimal storage dependency keeps denied browser storage and SSR imports harmless. */
interface PresetStorage {
  /** Reads existing VueUse preference representation. */
  getItem: (key: string) => string | null
  /** Writes compatible preferences, never runtime callbacks or instances. */
  setItem: (key: string, value: string) => void
}

/** Reads legacy keys from a known structured target; concatenated IDs are never parsed. */
export function createStandalonePresetStorage(getStorage: () => PresetStorage | undefined, target: HistoireTarget): RuntimePresetPersistence {
  const prefix = `_histoire-presets/${target.storyId}:${target.variantId}`
  return {
    load(): RuntimePresetStorageSnapshot {
      try {
        const storage = getStorage()
        const raw = storage?.getItem(`${prefix}/states`)
        if (!raw || raw.length > 8 * 1024 * 1024) return { items: [] }
        const entries: unknown = JSON.parse(raw)
        if (!Array.isArray(entries)) return { items: [] }
        const items: RuntimePresetStorageSnapshot['items'] = []
        const ids = new Set<string>()
        for (const entry of entries.slice(0, 1000)) {
          if (!Array.isArray(entry) || entry.length !== 2) continue
          const [id, preset] = entry
          if (typeof id !== 'string' || !id || id.length > 256 || ids.has(id) || !preset || typeof preset !== 'object') continue
          if (typeof preset.label !== 'string' || !preset.label.trim() || preset.label.trim().length > 120 || !preset.state || typeof preset.state !== 'object' || Array.isArray(preset.state)) continue
          try {
            validateWireValue(preset.state, { kind: 'request', name: 'state.patch' })
          }
          catch {
            continue
          }
          ids.add(id)
          items.push({ id, label: preset.label.trim(), value: preset.state })
        }
        const selectedId = storage?.getItem(`${prefix}/selected`)
        return { items, ...(selectedId && ids.has(selectedId) ? { selectedId } : {}) }
      }
      catch {
        return { items: [] }
      }
    },
    save(snapshot): void {
      try {
        const storage = getStorage()
        const entries = snapshot.items.flatMap((item) => {
          try {
            const state = Object.fromEntries(Object.entries(item.value).filter(([key]) => key !== '_hPropDefs'))
            // Cycles remain valid runtime presets but cannot enter legacy JSON storage.
            JSON.stringify(state)
            return [[item.id, { label: item.label, state }]]
          }
          catch {
            return []
          }
        })
        storage?.setItem(`${prefix}/states`, JSON.stringify(entries))
        const selected = entries.some(entry => entry[0] === snapshot.selectedId) ? snapshot.selectedId! : 'default'
        storage?.setItem(`${prefix}/selected`, selected)
      }
      catch {
        // Denied storage/quota never prevents canonical runtime edits or cleanup.
      }
    },
  }
}
