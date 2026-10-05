import type { SettingsStorage } from './settings.js'

/** One explicit browser save retained across workbench/runtime replacement. */
export interface PendingProjectSave {
  /** Server receipt capability; never replay a write during recovery. */
  requestId: string
  /** Exact submitted local values used only to retire unchanged overrides. */
  patches: { path: string, value: unknown }[]
}

/** Completed receipts wait for their matching local override to be retired. */
export interface ProjectSaveReceipt extends PendingProjectSave {
  /** Only server-confirmed saves may retire an exact local value. */
  completion?: 'saved'
}

/** Canonical JSON comparison ignores harmless object property ordering. */
export function projectValueSignature(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item)
}

/** Loads bounded pending and completed capabilities, including legacy single-receipt storage. */
export function readProjectSaves(storage: SettingsStorage | undefined, key: string): ProjectSaveReceipt[] {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return []
    if (new TextEncoder().encode(raw).byteLength > 64 * 1024) throw new Error('Invalid pending project save')
    const parsed = JSON.parse(raw) as ProjectSaveReceipt | ProjectSaveReceipt[]
    const values = Array.isArray(parsed) ? parsed : [parsed]
    if (!values.length || values.length > 32) throw new Error('Invalid pending project save')
    const requestIds = new Set<string>()
    let patchCount = 0
    for (const value of values) {
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value?.requestId) || !Array.isArray(value.patches) || !value.patches.length || value.patches.length > 32 || (value.completion !== undefined && value.completion !== 'saved') || requestIds.has(value.requestId)) throw new Error('Invalid pending project save')
      if (value.patches.some(patch => !patch || typeof patch.path !== 'string' || patch.path.length > 256 || !Object.hasOwn(patch, 'value'))) throw new Error('Invalid pending project save')
      requestIds.add(value.requestId)
      patchCount += value.patches.length
    }
    if (patchCount > 128) throw new Error('Invalid pending project save')
    return values
  }
  catch {
    writeProjectSaves(storage, key)
    return []
  }
}

/** Private session storage is optional; successful receipts survive section replacement. */
export function writeProjectSaves(storage: SettingsStorage | undefined, key: string, values: ProjectSaveReceipt[] = []): boolean {
  const json = values.length ? JSON.stringify(values) : undefined
  if (json && new TextEncoder().encode(json).byteLength > 64 * 1024) return false
  try {
    if (json) storage?.setItem(key, json)
    else storage?.removeItem(key)
  }
  catch { /* A denied storage getter/write never blocks the owned transport. */ }
  return true
}
