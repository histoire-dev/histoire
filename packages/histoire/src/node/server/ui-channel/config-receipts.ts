import type { HistoireConfig } from '@histoire/shared'
import type { ConfigPatch, JsonValue } from '../../config/codemod/index.js'
import type { Context } from '../../context.js'
import { configFileHash } from '../../config/codemod/index.js'
import { parseConfigPath } from '../../config/codemod/paths.js'

/** Private completion retained across the intended runtime restart, never config contents. */
export interface ConfigSaveCompletion {
  /** Browser-generated capability identifying only this explicit save. */
  requestId: string
  /** Pending writes/effective reloads do not retire local overrides. */
  completion: 'pending' | 'saved' | 'failed'
  /** Effective, verified option paths only. */
  saved?: string[]
  /** Controlled failure with no config execution output. */
  error?: string
}

/** A bounded server-owned save receipt; patch values are never returned to clients. */
interface ConfigSaveReceipt {
  /** Context that admitted the write. */
  owner: WeakRef<Context>
  /** Exact destination under the already guarded root. */
  file: string
  /** Validated snapshot used to check effective successor config. */
  patches: ConfigPatch[]
  /** Pending/final write identity, not a socket reference. */
  hash?: string
  /** Whether bytes changed and therefore require a successor generation. */
  restart: boolean
  /** Deliberate terminal error; missing means pending or verified. */
  error?: string
  /** Bound abandoned receipt retention to ten minutes. */
  expires: number
  /** Hooks already completed for an exact active generation. */
  notified: WeakSet<Context>
}

/** Receipt capabilities stay process-owned and never retain browser connections. */
const receipts = new Map<string, Map<string, ConfigSaveReceipt>>()
/** Trusted save listeners belong to exact server context, not incoming JSON. */
const listeners = new WeakMap<Context, Set<(paths: readonly string[], agents?: HistoireConfig['agents']) => Promise<void>>>()

/** Registers server-owned override retirement after verified effective save. */
export function onVerifiedConfigSave(ctx: Context, callback: (paths: readonly string[], agents?: HistoireConfig['agents']) => Promise<void>): () => void {
  const callbacks = listeners.get(ctx) ?? new Set()
  callbacks.add(callback)
  listeners.set(ctx, callbacks)
  return () => callbacks.delete(callback)
}

/** Admits bounded unique requests before queueing, preventing unknown-receipt races. */
export function beginConfigSave(ctx: Context, requestId: string, file: string, patches: ConfigPatch[]): ConfigSaveReceipt {
  const project = receipts.get(ctx.root) ?? new Map<string, ConfigSaveReceipt>()
  const now = Date.now()
  for (const [id, receipt] of project) {
    if (receipt.expires < now) project.delete(id)
  }
  if (project.has(requestId)) throw new Error('Invalid config save request: requestId already used')
  if (project.size >= 64) {
    const completed = [...project].find(([, receipt]) => receipt.hash || receipt.error)
    if (!completed) throw new Error('Invalid config save request: too many pending saves')
    project.delete(completed[0])
  }
  const receipt: ConfigSaveReceipt = { owner: new WeakRef(ctx), file, patches: structuredClone(patches), restart: true, expires: now + 10 * 60_000, notified: new WeakSet() }
  project.set(requestId, receipt)
  receipts.set(ctx.root, project)
  return receipt
}

/** Records only a successful real-path load; inactive owners may retain proof, not publish. */
export function verifyConfigSave(receipt: ConfigSaveReceipt, file: string, hash: string, previousHash?: string): void {
  receipt.file = file
  receipt.hash = hash
  receipt.restart = hash !== previousHash
}

/** Failed/retired queued writes retain explicit safe outcome for reconnect. */
export function failConfigSave(receipt: ConfigSaveReceipt | undefined, error: string): void {
  if (receipt) receipt.error = error
}

/** Refuses keyed preset operations which would invalidate their selector identity. */
export function assertStablePresetIdentities(patches: readonly ConfigPatch[], agents?: HistoireConfig['agents']): void {
  const keyed = patches.filter(patch => patch.path.startsWith('agents.presets['))
  const ids = agents?.presets?.map(preset => preset.id) ?? []
  if (keyed.length && new Set(ids).size !== ids.length) throw new Error('Cannot edit agent presets with duplicate ids')
  for (const patch of keyed) {
    const tokens = parseConfigPath(patch.path)
    const selector = tokens.find(token => typeof token !== 'string')
    if (!selector) continue
    const tail = tokens.at(-1)
    if (tail === 'id') throw new Error('Cannot edit keyed agent preset id')
    if (tail !== selector || patch.value === undefined) continue
    if (Array.isArray(patch.value) || !patch.value || typeof patch.value !== 'object' || patch.value.id !== selector.id) {
      throw new Error('Cannot edit keyed agent preset id')
    }
  }
}

/** Checks effective values while allowing default-filled object fields. */
function matchesValue(current: unknown, expected: JsonValue): boolean {
  if (current === expected) return true
  if (!current || !expected || typeof current !== 'object' || typeof expected !== 'object') return false
  if (Array.isArray(expected)) return Array.isArray(current) && current.length === expected.length && expected.every((value, index) => matchesValue(current[index], value))
  if (Array.isArray(current)) return false
  return Object.entries(expected).every(([key, value]) => Object.hasOwn(current, key) && matchesValue((current as Record<string, unknown>)[key], value))
}

/** Reads a path from either runtime config or an isolated pre-write config load. */
function effectiveConfigValue(config: unknown, name: string): unknown {
  let value = config
  for (const token of parseConfigPath(name)) {
    if (typeof token === 'string') value = value && typeof value === 'object' ? (value as Record<string, unknown>)[token] : undefined
    else value = Array.isArray(value) ? value.find(item => item && typeof item === 'object' && item.id === token.id) : undefined
  }
  return value
}

/** Checks loaded config values before bytes become visible to the project watcher. */
export function matchesConfigPatches(config: unknown, patches: readonly ConfigPatch[]): boolean {
  return patches.every(patch => patch.value === undefined
    ? effectiveConfigValue(config, patch.path) === undefined
    : matchesValue(effectiveConfigValue(config, patch.path), patch.value))
}

/** Successor publishes completion only after disk and effective config agree. */
export async function resolveConfigSave(ctx: Context, requestId: string, isActive: () => boolean): Promise<ConfigSaveCompletion> {
  const receipt = receipts.get(ctx.root)?.get(requestId)
  const result = { requestId }
  if (!receipt || receipt.expires < Date.now()) return { ...result, completion: 'failed', error: 'Config save completion unavailable. Reload settings before retrying.' }
  if (receipt.error) return { ...result, completion: 'failed', error: receipt.error }
  if (!receipt.hash || (receipt.restart && receipt.owner.deref() === ctx)) return { ...result, completion: 'pending' }
  if (await configFileHash(receipt.file, { root: ctx.root }) !== receipt.hash) return { ...result, completion: 'failed', error: 'Config conflict: file changed on disk. Reload settings.' }
  if (!ctx.config || !matchesConfigPatches(ctx.config, receipt.patches)) {
    return { ...result, completion: 'failed', error: 'Saved config is not effective in this runtime. Reload settings.' }
  }
  if (!isActive()) return { ...result, completion: 'pending' }
  const paths = receipt.patches.map(patch => patch.path)
  if (!receipt.notified.has(ctx)) {
    for (const callback of listeners.get(ctx) ?? []) await callback(paths, ctx.config.agents)
    if (!isActive()) return { ...result, completion: 'pending' }
    receipt.notified.add(ctx)
  }
  if (await configFileHash(receipt.file, { root: ctx.root }) !== receipt.hash || !isActive()) return { ...result, completion: 'pending' }
  return { ...result, completion: 'saved', saved: paths }
}
