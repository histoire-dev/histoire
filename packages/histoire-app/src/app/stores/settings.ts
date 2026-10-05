import type { InjectionKey } from 'vue'
import { inject, provide, reactive, ref } from 'vue'

/** Small storage interface lets standalone persist while embeddings stay memory-only. */
export interface SettingsStorage {
  /** Reads one local preference. */
  getItem: (key: string) => string | null
  /** Writes one local preference. */
  setItem: (key: string, value: string) => void
  /** Removes overrides after reset. */
  removeItem: (key: string) => void
}

/** Local-only preferences never enter project config patches. */
export interface UiSettings {
  /** Interface spacing. */
  density: 'comfortable' | 'compact'
  /** Reuse zoom across stories. */
  syncZoom: boolean
  /** Rerun tests after story updates. */
  watchTests: boolean
}

/** Settings sections, ordered like the supplied design. */
export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'viewports', label: 'Viewports', icon: 'monitor' },
  { id: 'tests', label: 'Tests', icon: 'flask-conical', devOnly: true },
  { id: 'agents', label: 'AI agents (ACP)', icon: 'bot', devOnly: true },
  { id: 'mcp', label: 'MCP server', icon: 'plug', devOnly: true },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard' },
  { id: 'about', label: 'About', icon: 'info' },
] as const

/** Hidden dev sections and invalid URLs recover to Appearance. */
export function normalizeSettingsSection(section: unknown, dev: boolean): string {
  return SETTINGS_SECTIONS.find(item => item.id === section && (dev || !('devOnly' in item)))?.id ?? 'appearance'
}

/** Creates one workbench preference owner; no active Pinia/global state. */
export function createUiSettingsStore(options: { storage?: SettingsStorage, warn?: (message: string) => void }) {
  const defaults: UiSettings = { density: 'comfortable', syncZoom: false, watchTests: false }
  const state = reactive({ ...defaults })
  const defaultArrange = ref<'grid' | 'list' | undefined>()
  try {
    const raw = options.storage?.getItem('_histoire-ui-settings')
    if (raw) {
      const saved = JSON.parse(raw)
      if (!saved || !['comfortable', 'compact'].includes(saved.density) || typeof saved.syncZoom !== 'boolean' || typeof saved.watchTests !== 'boolean') throw new Error('Invalid settings')
      Object.assign(state, { density: saved.density, syncZoom: saved.syncZoom, watchTests: saved.watchTests })
    }
    const arrange = options.storage?.getItem('_histoire-ui-arrange')
    if (arrange) {
      const value = JSON.parse(arrange)
      if (value === 'grid' || value === 'list') defaultArrange.value = value
    }
  }
  catch {
    (options.warn ?? console.warn)('Corrupt Histoire UI settings discarded')
    try {
      options.storage?.removeItem('_histoire-ui-settings')
    }
    catch { /* Denied storage cannot prevent mounting settings. */ }
  }
  /** Persists valid local preferences immediately. */
  function update(patch: Partial<UiSettings>): void {
    Object.assign(state, patch)
    try {
      options.storage?.setItem('_histoire-ui-settings', JSON.stringify(state))
    }
    catch { /* Memory preferences still apply when storage is unavailable. */ }
  }
  return {
    state,
    defaultArrange,
    update,
    /** Arrangement override is separate from the documented local-only settings shape. */
    setArrange(value: 'grid' | 'list' | undefined): void {
      defaultArrange.value = value
      try {
        if (value) options.storage?.setItem('_histoire-ui-arrange', JSON.stringify(value))
        else options.storage?.removeItem('_histoire-ui-arrange')
      }
      catch { /* Runtime does not depend on browser storage availability. */ }
    },
    /** Reset keeps project defaults authoritative. */
    reset(): void { update(defaults) },
  }
}

/** Single nearest-provider owner, absent on reusable embedded surfaces. */
const settingsKey: InjectionKey<ReturnType<typeof createUiSettingsStore>> = Symbol('histoire-ui-settings')

/** Installs standalone-owned preferences beneath its HistoireProvider. */
export function provideUiSettingsStore(store: ReturnType<typeof createUiSettingsStore>): void {
  provide(settingsKey, store)
}

/** Reads only owning workbench preferences. */
export function useUiSettingsStore(): ReturnType<typeof createUiSettingsStore> | undefined {
  return inject(settingsKey, undefined)
}
