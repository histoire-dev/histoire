import type { Context } from '../../context.js'
import { configFileHash } from '../../config/codemod/write.js'
import { analyzePluginSource, disablePluginEntry, enablePluginEntry } from '../../config/plugin-toggle-source.js'
import { safeConfigWrite } from '../../config/safe-config-write.js'

/** One bounded browser-requested state change. */
export interface PluginToggleChange {
  /** Server-issued entry identifier. */
  id: string
  /** Requested state. */
  enabled: boolean
}
/** A receipt remains in process memory across the intended runtime restart. */
interface Receipt {
  /** Original generation must not confirm its own write. */
  owner: WeakRef<Context>
  /** Guarded config destination. */
  file: string
  /** Committed source revision. */
  hash?: string
  /** Expected successor states. */
  changes: Array<{ index: number, name: string, enabled: boolean }>
  /** Controlled terminal failure. */
  error?: string
  /** Receipt expiry timestamp. */
  expires: number
}
const projects = new Map<string, Map<string, Receipt>>()
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

/** Strictly validates write capabilities without accepting paths or config source. */
export function validatePluginApply(value: unknown): { requestId: string, changes: PluginToggleChange[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request')
  const request = value as Record<string, unknown>
  if (Object.keys(request).some(key => !['requestId', 'changes'].includes(key)) || typeof request.requestId !== 'string' || !uuid.test(request.requestId) || !Array.isArray(request.changes) || !request.changes.length || request.changes.length > 64) throw new Error('Invalid request')
  const ids = new Set<string>()
  const changes = request.changes.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['id', 'enabled'].includes(key)) || typeof item.id !== 'string' || !uuid.test(item.id) || typeof item.enabled !== 'boolean' || ids.has(item.id)) throw new Error('Invalid request')
    ids.add(item.id)
    return { id: item.id, enabled: item.enabled }
  })
  return { requestId: request.requestId, changes }
}

/** Resolves receipt against successor source and effective plugin identities. */
export async function pluginToggleStatus(ctx: Context, requestId: string): Promise<{ completion: 'pending' | 'saved' | 'failed', error?: string }> {
  if (!uuid.test(requestId)) return { completion: 'failed', error: 'Invalid plugin request.' }
  const receipt = projects.get(ctx.root)?.get(requestId)
  if (!receipt || receipt.expires < Date.now()) return { completion: 'failed', error: 'Plugin change completion unavailable. Reload settings.' }
  if (receipt.error) return { completion: 'failed', error: receipt.error }
  if (!receipt.hash || receipt.owner.deref() === ctx) return { completion: 'pending' }
  if (await configFileHash(receipt.file, { root: ctx.root }) !== receipt.hash) return { completion: 'failed', error: 'Config changed on disk. Reload settings.' }
  const inventory = ctx.pluginToggle
  if (!inventory || inventory.hash !== receipt.hash || receipt.changes.some((change) => {
    const entry = inventory.entries[change.index]
    if (!entry || entry.enabled !== change.enabled) return true
    const row = inventory.configured[change.index]
    const active = ctx.config.plugins.filter(plugin => plugin.name === change.name).length
    return !row || row.name !== change.name || row.enabled !== change.enabled || active !== (change.enabled ? 1 : 0)
  })) {
    return { completion: 'failed', error: 'Saved plugin changes are not effective. Check the config and server output.' }
  }
  return { completion: 'saved' }
}

/** Applies all staged edits with one checked config write and one restart. */
export async function applyPluginChanges(ctx: Context, request: { requestId: string, changes: PluginToggleChange[] }, isActive: () => boolean): Promise<void> {
  const inventory = ctx.pluginToggle
  if (!inventory || ctx.mode !== 'dev' || !isActive()) throw new Error('Plugin changes unavailable. Edit the config manually.')
  const project = projects.get(ctx.root) ?? new Map<string, Receipt>()
  for (const [id, previous] of project) {
    if (previous.expires < Date.now() || (await pluginToggleStatus(ctx, id)).completion !== 'pending') project.delete(id)
  }
  if (project.size) throw new Error('Another plugin change is pending.')
  const changes = request.changes.map((change) => {
    const target = inventory.targets.get(change.id)
    if (!target || target.row.enabled === change.enabled) throw new Error('Plugin selection changed. Reload settings.')
    return { index: target.index, name: target.row.name, enabled: change.enabled, row: target.row, devOnly: target.devOnly }
  })
  const receipt: Receipt = { owner: new WeakRef(ctx), file: inventory.file, changes: changes.map(({ index, name, enabled }) => ({ index, name, enabled })), expires: Date.now() + 10 * 60_000 }
  project.set(request.requestId, receipt)
  projects.set(ctx.root, project)
  try {
    if (await configFileHash(inventory.file, { root: ctx.root }) !== inventory.hash) throw new Error('Config changed on disk. Reload settings.')
    let code = inventory.source
    for (const change of [...changes].sort((a, b) => b.index - a.index)) {
      const entry = inventory.entries[change.index]
      code = change.enabled ? enablePluginEntry(code, entry) : disablePluginEntry(code, entry, { ...change.row, devOnly: change.devOnly })
    }
    const edited = analyzePluginSource(code)
    const expectedNames = edited.flatMap((entry, index) => entry.enabled ? [inventory.configured[index].name] : [])
    const written = await safeConfigWrite({ root: ctx.root, file: inventory.file, code, expectedHash: inventory.hash, expectedNames, isActive })
    receipt.hash = written.hash
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    receipt.error = message.includes('config changed on disk') ? 'Config changed on disk. Reload settings.' : /^(?:Config changed|Plugin selection|Plugin changes cancelled|Plugin config could not)/.test(message) ? message : 'Could not apply plugin changes. Check config and server output.'
    throw new Error(receipt.error)
  }
}
