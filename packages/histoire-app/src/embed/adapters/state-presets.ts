import type { HistoirePresetAction, HistoirePresetList } from '@histoire/protocol'
import { applySerializedState, HistoireSdkError } from '@histoire/protocol'

/** Compatible serializable preferences stay inside first-party story runtime. */
export interface RuntimePresetStorageSnapshot {
  /** Opaque IDs accompany cleaned state only in local storage adapter. */
  items: { id: string, label: string, value: Record<string, any> }[]
  /** Explicit legacy selection; missing value preserves initial state. */
  selectedId?: string
}
/** Standalone injects storage; embedded presets remain memory-only. */
export interface RuntimePresetPersistence {
  /** Loads compatible legacy entries without mutating runtime state. */
  load: () => RuntimePresetStorageSnapshot
  /** Persists cleaned values; denied storage must remain non-fatal. */
  save: (snapshot: RuntimePresetStorageSnapshot) => void
}
/** Capture plain graph while retaining runtime-owned callbacks and class/DOM identities. */
function captureLocal(value: any, seen = new WeakMap<object, any>()): any {
  if (!value || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return seen.get(value)
  }
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return value
  }
  const copy: any = Array.isArray(value) ? [] : {}
  seen.set(value, copy)
  for (const key of Object.keys(value)) {
    if (key !== '_hPropDefs') {
      copy[key] = captureLocal(value[key], seen)
    }
  }
  return copy
}
/** Restore captured opaque owners before reconciling saved serializable fields. */
function restoreOwners(target: any, saved: any, seen = new WeakMap<object, any>()): void {
  if (!saved || typeof saved !== 'object' || seen.has(saved)) {
    return
  }
  seen.set(saved, target)
  for (const key of Object.keys(saved)) {
    const value = saved[key]
    if (typeof value === 'function' || (value && typeof value === 'object' && !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
      target[key] = value
    }
    else if (value && typeof value === 'object') {
      if (seen.has(value)) {
        target[key] = seen.get(value)
      }
      else {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = Array.isArray(value) ? [] : {}
        }
        restoreOwners(target[key], value, seen)
      }
    }
  }
}
/** Presets live in selected runtime document; only opaque IDs and labels leave it. */
export function createRuntimeStatePresets(getState: () => Record<string, any>, serialize: (value: any) => Record<string, any>, persistence?: RuntimePresetPersistence, resetSelected?: () => void) {
  const presets = new Map<string, {
    label: string
    local: Record<string, any>
    value: Record<string, any>
  }>()
  let counter = 0
  let selectedId: string | undefined
  let restored = false
  const stored = persistence?.load()
  for (const item of stored?.items ?? []) {
    presets.set(item.id, { label: item.label, local: captureLocal(getState()), value: item.value })
  }
  selectedId = stored?.selectedId
  /** Serialized values never leave runtime through preset bridge responses. */
  function persist(): void {
    persistence?.save({ items: [...presets].map(([id, preset]) => ({ id, label: preset.label, value: preset.value })), ...(selectedId ? { selectedId } : {}) })
  }
  return {
    /** Called after initial reset snapshot capture, once before readiness publication. */
    restoreSelected(): void {
      if (restored) return
      restored = true
      const preset = selectedId ? presets.get(selectedId) : undefined
      if (!preset) return
      restoreOwners(getState(), preset.local)
      applySerializedState(getState(), preset.value, true)
    },
    /** Reset updates preference without deleting compatible saved presets. */
    clearSelection(): void {
      selectedId = undefined
      persist()
    },
    /** Finite UI actions never transfer values/callbacks or execute arbitrary code. */
    execute(input: HistoirePresetAction): HistoirePresetList {
      if (input.action === 'save') {
        if (presets.size >= 1000) {
          throw new HistoireSdkError('INVALID_ARGUMENT', 'Runtime preset limit reached')
        }
        do {
          selectedId = `preset-${++counter}`
        } while (presets.has(selectedId))
        presets.set(selectedId, { label: input.label!, local: captureLocal(getState()), value: serialize(getState()) })
      }
      else if (input.action !== 'list') {
        const preset = presets.get(input.id)
        if (!preset) {
          throw new HistoireSdkError('INVALID_ARGUMENT', 'Unknown runtime preset')
        }
        if (input.action === 'delete') {
          presets.delete(input.id!)
          if (selectedId === input.id) {
            // Restore canonical initial snapshot before publishing cleared selection.
            resetSelected?.()
            selectedId = undefined
          }
        }
        else if (input.action === 'rename') {
          preset.label = input.label!
        }
        else {
          restoreOwners(getState(), preset.local)
          applySerializedState(getState(), preset.value, true)
          selectedId = input.id
        }
      }
      if (input.action !== 'list') persist()
      return { items: [...presets].map(([id, preset]) => ({ id, label: preset.label })), ...(selectedId ? { selectedId } : {}) }
    },
  }
}
