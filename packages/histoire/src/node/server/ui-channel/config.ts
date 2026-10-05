import type { ConfigPatch, ConfigPathAnalysis } from '../../config/codemod/index.js'
import type { Context } from '../../context.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { analyzeConfigPath, assertConfigPatches, assertConfigPath, cleanupConfigBackups, configFileHash, createConfig, editConfig, restoreConfigBackup, writeConfig } from '../../config/codemod/index.js'
import { loadConfigFile, resolveConfigFile } from '../../config/index.js'
import { assertStablePresetIdentities, beginConfigSave, failConfigSave, matchesConfigPatches, resolveConfigSave, verifyConfigSave } from './config-receipts.js'

/** Safe source status; actual config source and environment never cross the socket. */
interface ConfigState {
  /** Explicit save identity carried across its intended generation restart. */
  requestId?: string
  /** Local overrides retire only after effective successor confirmation. */
  completion?: 'pending' | 'saved' | 'failed'
  /** Project-relative file shown in provenance badges. */
  file?: string
  /** Exact disk revision for conflict checks. */
  hash?: string
  /** Analysis of allowlisted visible settings. */
  paths: Record<string, ConfigPathAnalysis>
  /** Confirmed saved option paths. */
  saved?: string[]
  /** Deliberate public failure. */
  error?: string
}

/** Validates visible section request before accessing any config file. */
export function validateConfigRead(value: unknown): { paths: string[], requestId?: string } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { paths?: unknown }).paths)) throw new Error('Invalid config read request')
  const paths = (value as { paths: unknown[] }).paths
  if (paths.length > 32 || paths.some(item => typeof item !== 'string')) throw new Error('Invalid config paths')
  for (const item of paths) assertConfigPath(item as string)
  const requestId = validateRequestId((value as { requestId?: unknown }).requestId)
  return { paths: [...new Set(paths as string[])], ...requestId ? { requestId } : {} }
}

/** Request capability is bounded and contains no source path or private settings. */
function validateRequestId(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) throw new Error('Invalid config requestId')
  return value
}

/** Rejects local-only settings, secrets, executable values and unbounded revisions. */
export function validateConfigSave(value: unknown): { patches: ConfigPatch[], expectedHash?: string, requestId?: string } {
  if (!value || typeof value !== 'object') throw new Error('Invalid config save request')
  const request = value as { patches?: unknown, expectedHash?: unknown, requestId?: unknown }
  if (!Array.isArray(request.patches) || !request.patches.length || request.patches.length > 32) throw new Error('Invalid config patches')
  if (request.expectedHash !== undefined && (typeof request.expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(request.expectedHash))) throw new Error('Invalid config hash')
  const patches = request.patches.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.path !== 'string' || !Object.hasOwn(item, 'value')) throw new Error('Invalid config patch')
    return { path: item.path, value: item.value } as ConfigPatch
  })
  assertConfigPatches(patches)
  for (const patch of patches) validateSetting(patch)
  assertStablePresetIdentities(patches)
  return { patches, expectedHash: request.expectedHash as string | undefined, requestId: validateRequestId(request.requestId) }
}

/** Guard option shape as well as writable path; browser requests remain untrusted. */
function validateSetting(patch: ConfigPatch): void {
  const value = patch.value
  if (value === undefined) return
  /** Reject malformed options with one stable public failure. */
  function requireValid(valid: boolean): void {
    if (!valid) throw new Error(`Invalid config value for ${patch.path}`)
  }
  /** Valid nonempty labels and CSS values are kept as authored. */
  function text(item: unknown): item is string {
    return typeof item === 'string' && item.trim().length > 0
  }
  if (patch.path === 'theme.defaultColorScheme') {
    requireValid(['auto', 'light', 'dark'].includes(value as string))
  }
  else if (patch.path === 'ui.defaultArrange') {
    requireValid(['grid', 'list'].includes(value as string))
  }
  else if (patch.path === 'responsivePresets') {
    requireValid(Array.isArray(value) && value.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false
      return text(item.label) && typeof item.width === 'number' && item.width > 0 && (item.height == null || (typeof item.height === 'number' && item.height > 0))
    }))
  }
  else if (patch.path === 'backgroundPresets') {
    requireValid(Array.isArray(value) && value.every(item => item && typeof item === 'object' && !Array.isArray(item) && text(item.label) && text(item.color)))
  }
  else if (patch.path === 'agents.permissions') {
    requireValid(Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => ['fileEdits', 'terminal'].includes(key))))
    const permissions = value as Record<string, unknown>
    requireValid(permissions.fileEdits === undefined || ['ask', 'allow-src', 'never'].includes(permissions.fileEdits as string))
    requireValid(permissions.terminal === undefined || ['ask', 'allow', 'never'].includes(permissions.terminal as string))
  }
  else if (patch.path.startsWith('agents.presets')) {
    /** One complete preset has only project-safe launch data. */
    function preset(item: unknown): item is { id: string, name: string, command: string } {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !Object.keys(item).every(key => ['id', 'name', 'command', 'args', 'cwd', 'default'].includes(key))) return false
      const agent = item as Record<string, unknown>
      return text(agent.id) && text(agent.name) && text(agent.command)
        && (agent.args === undefined || (Array.isArray(agent.args) && agent.args.every(arg => typeof arg === 'string')))
        && (agent.cwd === undefined || typeof agent.cwd === 'string') && (agent.default === undefined || typeof agent.default === 'boolean')
    }
    const field = /\]\.(id|name|command|args|cwd|default)$/.exec(patch.path)?.[1]
    if (field === 'default') {
      requireValid(typeof value === 'boolean')
    }
    else if (field === 'args') {
      requireValid(Array.isArray(value) && value.every(arg => typeof arg === 'string'))
    }
    else if (field === 'cwd') {
      requireValid(typeof value === 'string')
    }
    else if (field) {
      requireValid(text(value))
    }
    else if (patch.path !== 'agents.presets') {
      requireValid(preset(value))
    }
    else {
      const ids = new Set<string>()
      requireValid(Array.isArray(value) && value.every((item) => {
        if (!preset(item) || ids.has(item.id)) return false
        ids.add(item.id)
        return true
      }))
    }
  }
}

/** Errors from config execution may contain secrets; reply only with controlled messages. */
function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('config changed on disk')) return 'Config conflict: file changed on disk. Reload settings.'
  if (/^(?:Config (?:path|key|values)|Agent env|Invalid config|Cannot edit|Computed|Config file)/.test(message)) return message
  return 'Could not save project config. Check config syntax and server output.'
}

/** Dev Settings uses the existing watcher; successful saves never request another restart. */
export function registerConfigChannel(ctx: Context, channel: UiChannelServer, isActive: () => boolean = () => true): void {
  let closed = false
  let queue: Promise<unknown> = Promise.resolve()
  /** Resolve only within this captured root; codemod guards symlinks and parent configs. */
  function file(): string {
    return resolveConfigFile(ctx.root, ctx.configFile) ?? path.join(ctx.root, 'histoire.config.ts')
  }
  /** Gather one revision and only the requested path metadata. */
  async function read(paths: string[]): Promise<ConfigState> {
    const current = file()
    const analyses = await Promise.all(paths.map(async name => [name, await analyzeConfigPath(current, name, { root: ctx.root })] as const))
    return { file: path.relative(ctx.root, current), hash: await configFileHash(current, { root: ctx.root }), paths: Object.fromEntries(analyses) }
  }
  /** Reply belongs to the originating browser and active runtime generation. */
  function send(state: ConfigState, client: UiChannelClient): void {
    if (!closed && isActive()) channel.send('histoire:ui:config-state', state, client)
  }
  /** Catch invalid feature requests deliberately, so client can leave pending state. */
  channel.on('histoire:ui:config-read', value => value, async (value, client) => {
    let requestId: string | undefined
    try {
      requestId = validateRequestId(value && typeof value === 'object' ? (value as { requestId?: unknown }).requestId : undefined)
      const request = validateConfigRead(value)
      const state = await read(request.paths)
      const completion = request.requestId ? await resolveConfigSave(ctx, request.requestId, isActive) : {}
      send({ ...state, ...completion }, client)
    }
    catch (error) { send({ paths: {}, ...requestId ? { requestId, completion: 'failed' as const } : {}, error: publicError(error) }, client) }
  })
  channel.onReady(client => send({ paths: {} }, client))
  channel.on('histoire:ui:config-save', value => value, async (value, client) => {
    let request: ReturnType<typeof validateConfigSave>
    let receipt: ReturnType<typeof beginConfigSave> | undefined
    let requestId: string | undefined
    try {
      requestId = validateRequestId(value && typeof value === 'object' ? (value as { requestId?: unknown }).requestId : undefined)
      request = validateConfigSave(value)
      assertStablePresetIdentities(request.patches, ctx.config?.agents)
      if (request.requestId) receipt = beginConfigSave(ctx, request.requestId, file(), request.patches)
    }
    catch (error) {
      send({
        paths: {},
        ...requestId ? { requestId, completion: 'failed' as const } : {},
        error: publicError(error),
      }, client)
      return
    }
    const work = queue.catch(() => {}).then(async () => {
      if (closed || !isActive()) {
        failConfigSave(receipt, 'Config save cancelled before write. Reload settings.')
        return
      }
      const paths = request.patches.map(patch => patch.path)
      try {
        const current = file()
        const hash = await configFileHash(current, { root: ctx.root })
        if (hash !== request.expectedHash) throw new Error('config changed on disk, reload settings')
        const preview = hash === undefined ? await createConfig(ctx.root, request.patches) : await editConfig(current, request.patches, { root: ctx.root })
        // Load next source from the same directory before touching watched config.
        // Relative imports resolve identically; a throwing config leaves original bytes intact.
        const destination = 'file' in preview ? preview.file : current
        const temporary = path.join(path.dirname(destination), `.histoire-config-check-${randomUUID()}${path.extname(destination)}`)
        try {
          await writeFile(temporary, preview.code, { flag: 'wx', mode: 0o600 })
          const loaded = await loadConfigFile(temporary)
          if (!matchesConfigPatches(loaded, request.patches)) throw new Error('Config file did not preserve requested values')
        }
        catch { throw new Error('Config file failed to load; original file was preserved.') }
        finally { await rm(temporary, { force: true }) }
        if (closed || !isActive()) {
          failConfigSave(receipt, 'Config save cancelled before write. Reload settings.')
          return
        }
        const written = await writeConfig(destination, preview.code, { root: ctx.root, expectedHash: request.expectedHash })
        try {
          const loaded = await loadConfigFile(destination)
          if (!matchesConfigPatches(loaded, request.patches)) throw new Error('Config file did not preserve requested values')
        }
        catch {
          // Configs can depend on their own filename. Validate the real path too,
          // restoring only while this exact write still owns the disk revision.
          if (written.backup) await restoreConfigBackup(destination, written.backup, { root: ctx.root, expectedHash: written.hash })
          else if (await configFileHash(destination, { root: ctx.root }) === written.hash) await rm(destination)
          throw new Error('Config file failed to load; original file was preserved.')
        }
        if (receipt) verifyConfigSave(receipt, destination, written.hash, request.expectedHash)
        const completion = request.requestId ? await resolveConfigSave(ctx, request.requestId, isActive) : { saved: paths }
        send({ ...await read(paths), ...completion }, client)
      }
      catch (error) {
        const state = await read(paths).catch(() => ({ paths: {} }))
        const message = publicError(error)
        failConfigSave(receipt, message)
        send({ ...state, ...request.requestId ? { requestId: request.requestId, completion: 'failed' as const } : {}, error: message }, client)
      }
    })
    queue = work
    await work
  })
  channel.addCleanup(async () => {
    closed = true
    await queue
    await cleanupConfigBackups(ctx.root)
  })
}
