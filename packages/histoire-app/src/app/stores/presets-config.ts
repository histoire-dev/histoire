import type { BackgroundPreset, ResponsivePreset } from '@histoire/shared'
import type { ComputedRef, InjectionKey } from 'vue'
import type { SettingsStorage } from './settings.js'
import { computed, inject, provide, shallowRef } from 'vue'

/** Persistent override replaces matching labels or hides project defaults. */
interface PresetOverride<T> {
  /** Original project label, or first label of an independent local row. */
  label: string
  /** Null hides a default without changing project config. */
  value: T | null
  /** Local identity cannot collide with a renamed project's original label. */
  localId?: number
}

/** Stable source or local ownership retained while a Settings draft is open. */
export interface PresetOwner {
  /** Original project label, or immutable local row identity. */
  label: string
  /** Stable local addition identity. */
  localId?: number
}

/** Config defaults remain live after HMR publication. */
interface PresetConfig {
  /** Project viewport defaults. */
  responsivePresets?: ResponsivePreset[]
  /** Project background defaults. */
  backgroundPresets?: BackgroundPreset[]
}

/** Validates user viewport dimensions before storage or runtime consumption. */
function validateViewport(value: ResponsivePreset): void {
  if (!value.label?.trim()) throw new Error('Preset label is required')
  if (!Number.isFinite(value.width) || value.width <= 0) throw new Error('Viewport width must be positive')
  if (value.height != null && (!Number.isFinite(value.height) || value.height <= 0)) throw new Error('Viewport height must be positive')
}

/** Validates background data without rewriting CSS colors. */
function validateBackground(value: BackgroundPreset): void {
  if (!value.label?.trim() || typeof value.color !== 'string' || !value.color.trim()) throw new Error('Background label and color are required')
}

/** Creates one merged collection while storing only differences from project defaults. */
function collection<T extends { label: string }>(options: { defaults: () => T[], key: string, storage?: SettingsStorage, validate: (value: T) => void, warn?: (message: string) => void }) {
  const overrides = shallowRef<PresetOverride<T>[]>([])
  let nextLocalId = 1
  try {
    const raw = options.storage?.getItem(options.key)
    if (raw) {
      const saved = JSON.parse(raw)
      if (!Array.isArray(saved) || saved.length > 1000) throw new Error('Invalid preset overrides')
      const identities = new Set<number>()
      for (const item of saved) {
        if (!item || typeof item.label !== 'string' || !item.label) throw new Error('Invalid preset label')
        if (item.localId !== undefined && (!Number.isSafeInteger(item.localId) || item.localId < 1)) throw new Error('Invalid preset identity')
        if (item.localId !== undefined) {
          if (identities.has(item.localId)) throw new Error('Duplicate preset identity')
          identities.add(item.localId)
        }
        if (item.value !== null) options.validate(item.value)
      }
      nextLocalId = Math.max(0, ...saved.map(item => item.localId ?? 0)) + 1
      // Old local additions used their first visible label as identity. Migrate
      // once so renaming then reusing that label cannot overwrite their row.
      const defaults = new Set(options.defaults().map(item => item.label))
      overrides.value = saved.map(item => item.localId === undefined && !defaults.has(item.label) ? { ...item, localId: nextLocalId++ } : item)
    }
  }
  catch {
    (options.warn ?? console.warn)('Corrupt Histoire preset settings discarded')
    try {
      options.storage?.removeItem(options.key)
    }
    catch { /* Storage may be unavailable. */ }
  }
  const items: ComputedRef<T[]> = computed(() => {
    const existing = new Set(options.defaults().map(item => item.label))
    const editedLabels = new Set(overrides.value.flatMap(entry => entry.value ? [entry.value.label] : []))
    const values = options.defaults().flatMap((item) => {
      const override = overrides.value.find(entry => entry.localId === undefined && entry.label === item.label)
      // A new unedited project row cannot duplicate an existing local choice.
      if (!override && editedLabels.has(item.label)) return []
      return override ? override.value === null ? [] : [{ ...override.value }] : [{ ...item }]
    })
    return [...values, ...overrides.value.flatMap(entry => (entry.localId !== undefined || !existing.has(entry.label)) && entry.value ? [{ ...entry.value }] : [])]
  })
  /** Persist updates atomically as one small JSON value. */
  function persist(): void {
    try {
      options.storage?.setItem(options.key, JSON.stringify(overrides.value))
    }
    catch { /* Local state continues to work if storage is denied. */ }
  }
  /** Replace exact source/local owner, without confusing identity and display label. */
  function put(label: string, value: T | null, localId?: number): void {
    overrides.value = [...overrides.value.filter(item => localId !== undefined ? item.localId !== localId : item.localId !== undefined || item.label !== label), { label, value, localId }]
    persist()
  }
  /** Resolves visible rows back to their durable source/local owner. */
  function owner(index: number): PresetOwner | undefined {
    const value = items.value[index]
    if (!value) return
    const override = overrides.value.find(item => item.value?.label === value.label)
    return override ? { label: override.label, localId: override.localId } : { label: value.label }
  }
  /** Removed rows cannot receive a stale draft after list changes. */
  function exists(owner: PresetOwner): boolean {
    const override = overrides.value.find(item => item.localId === owner.localId && item.label === owner.label)
    return override ? override.value !== null : owner.localId === undefined && options.defaults().some(item => item.label === owner.label)
  }
  /** Stable Vue keys prevent a reordered source row from inheriting another row state. */
  function key(index: number): string {
    const value = owner(index)
    return value ? value.localId === undefined ? `source:${value.label}` : `local:${value.localId}` : `missing:${index}`
  }
  return {
    items,
    overridden: computed(() => overrides.value.length > 0),
    /** Adds a unique preset; existing rows require explicit edit. */
    add(value: T): void {
      options.validate(value)
      if (items.value.some(item => item.label === value.label)) throw new Error('Preset label already exists')
      put(value.label, {
        ...value,
      }, nextLocalId++)
    },
    /** Exposes durable ownership for Settings drafts that outlive row ordering. */
    owner,
    /** Provides durable keys for reordered source and local preset rows. */
    key,
    /** Renaming retains the original label as the override's stable project identity. */
    update(target: number | PresetOwner, value: T): void {
      options.validate(value)
      const source = typeof target === 'number' ? owner(target) : target
      if (!source || !exists(source)) throw new Error('Preset no longer exists')
      if (items.value.some((item, index) => {
        const current = owner(index)
        return current && (current.label !== source.label || current.localId !== source.localId) && item.label === value.label
      })) {
        throw new Error('Preset label already exists')
      }
      put(source.label, { ...value }, source.localId)
    },
    /** Hide project presets; remove entirely for a local addition. */
    remove(index: number): void {
      const previous = items.value[index]
      if (!previous) return
      const original = overrides.value.find(entry => entry.value?.label === previous.label)
      const label = original?.label ?? previous.label
      if (original?.localId === undefined && options.defaults().some(item => item.label === label)) {
        put(label, null)
      }
      else {
        overrides.value = overrides.value.filter(item => item !== original)
        persist()
      }
    },
    /** Removes only this collection's local edits. */
    reset(): void {
      overrides.value = []
      try {
        options.storage?.removeItem(options.key)
      }
      catch { /* Reset still applies in memory. */ }
    },
  }
}

/** Toolbar and Settings share this scoped preset owner. */
export function createPresetConfigStore(options: { config: () => PresetConfig, storage?: SettingsStorage, warn?: (message: string) => void }) {
  const viewports = collection({ defaults: () => options.config().responsivePresets ?? [], key: '_histoire-ui-viewports', validate: validateViewport, ...options })
  const backgrounds = collection({ defaults: () => options.config().backgroundPresets ?? [], key: '_histoire-ui-backgrounds', validate: validateBackground, ...options })
  return {
    responsivePresets: viewports.items,
    backgroundPresets: backgrounds.items,
    viewportsOverridden: viewports.overridden,
    backgroundsOverridden: backgrounds.overridden,
    addViewport: viewports.add,
    updateViewport: viewports.update,
    viewportOwner: viewports.owner,
    viewportKey: viewports.key,
    removeViewport: viewports.remove,
    resetViewports: viewports.reset,
    addBackground: backgrounds.add,
    updateBackground: backgrounds.update,
    backgroundOwner: backgrounds.owner,
    backgroundKey: backgrounds.key,
    removeBackground: backgrounds.remove,
    resetBackgrounds: backgrounds.reset,
  }
}

/** Nearest workbench injection keeps embeds isolated. */
const presetsKey: InjectionKey<ReturnType<typeof createPresetConfigStore>> = Symbol('histoire-preset-config')

/** Installs one shared preset owner for toolbar and Settings. */
export function providePresetConfigStore(store: ReturnType<typeof createPresetConfigStore>): void {
  provide(presetsKey, store)
}

/** Optional in reusable surfaces; their descriptor remains their default source. */
export function usePresetConfigStore(): ReturnType<typeof createPresetConfigStore> | undefined {
  return inject(presetsKey, undefined)
}
