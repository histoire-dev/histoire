import type { UiAgentRegistry } from '@histoire/shared'
import type { AgentRegistryEntry } from './registry-schema.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'pathe'
import { parseAgentRegistry, resolveAgentDistribution } from './registry-schema.js'

/** Canonical published catalog, shared with task-runner. */
export const ACP_REGISTRY_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json'
/** Current catalog remains reusable for one day. */
const CACHE_TTL = 24 * 60 * 60 * 1000
/** Earlier normalized caches omitted logo metadata; refresh them once, retaining fallback. */
const CACHE_FORMAT = 1

/** Platform user cache never writes binaries into project source. */
export function agentCacheDirectory(): string {
  const directory = process.platform === 'win32' ? process.env.LOCALAPPDATA ?? homedir() : process.platform === 'darwin' ? path.join(homedir(), 'Library/Caches') : process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache')
  return path.join(directory, 'histoire')
}

/** Cached registry owner with injectable remote dependency for offline tests. */
export function createAgentRegistry(options: {
  /** Override user cache for tests. */
  cacheDir?: string
  /** Remote boundary. */
  fetch?: typeof fetch
  /** Platform override for catalog availability. */
  platform?: string
  /** Architecture override for catalog availability. */
  arch?: string
} = {}) {
  const cacheDir = options.cacheDir ?? agentCacheDirectory()
  const cacheFile = path.join(cacheDir, 'acp-registry.json')
  let entries: AgentRegistryEntry[] = []
  let pending: Promise<UiAgentRegistry> | undefined
  /** Return only safe display/command fields; environment never leaves server. */
  function project(status: UiAgentRegistry['status']): UiAgentRegistry {
    return { status, entries: entries.map((entry) => {
      const launch = resolveAgentDistribution(entry, options.platform, options.arch)
      return { id: entry.id, name: entry.name, version: entry.version, icon: entry.icon, available: !!launch, command: launch?.command ?? '', args: launch?.args ?? [] }
    }) }
  }
  /** Parse cache before using its timestamp; truncated files never count as fresh. */
  async function cached(): Promise<{ entries: AgentRegistryEntry[], age: number } | undefined> {
    try {
      const [body, info] = await Promise.all([readFile(cacheFile, 'utf8'), stat(cacheFile)])
      const document = JSON.parse(body)
      return { entries: parseAgentRegistry(document), age: document.cacheFormat === CACHE_FORMAT ? Date.now() - info.mtimeMs : Infinity }
    }
    catch { return undefined }
  }
  /** Concurrent readers share fetch; failed refresh retains last validated catalog. */
  async function load(force = false): Promise<UiAgentRegistry> {
    if (pending) return pending
    pending = (async () => {
      const saved = await cached()
      if (saved) entries = saved.entries
      if (!force && saved && saved.age < CACHE_TTL) return project({ state: 'fresh' })
      try {
        const response = await (options.fetch ?? fetch)(ACP_REGISTRY_URL, { signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error('Registry fetch failed')
        const body = await response.text()
        if (Buffer.byteLength(body) > 4 * 1024 * 1024) throw new Error('Registry document too large')
        const next = parseAgentRegistry(JSON.parse(body))
        const temporary = path.join(cacheDir, `.acp-registry-${randomUUID()}.tmp`)
        // Cache I/O failure must not discard a successfully fetched catalog.
        try {
          await mkdir(cacheDir, { recursive: true })
          await writeFile(temporary, JSON.stringify({ cacheFormat: CACHE_FORMAT, agents: next }), { flag: 'wx' })
          await rename(temporary, cacheFile)
        }
        catch { /* In-memory catalog remains usable with read-only user cache. */ }
        finally { await rm(temporary, { force: true }).catch(() => {}) }
        entries = next
        return project({ state: 'fresh' })
      }
      catch {
        return project({ state: saved || entries.length ? 'stale' : 'unavailable', error: 'Cannot refresh agent registry' })
      }
    })().finally(() => { pending = undefined })
    return pending
  }
  return {
    load,
    /** Resolve only validated server-side registry definitions. */
    async distribution(id: string) {
      await load()
      const entry = entries.find(entry => entry.id === id)
      if (!entry) throw new Error('Agent unavailable in ACP registry; refresh registry or save a custom command')
      const launch = resolveAgentDistribution(entry, options.platform, options.arch)
      if (!launch) throw new Error('Unavailable on this platform')
      return launch
    },
    /** Validated HTTPS logo URL of a registry entry, if any. */
    async iconUrl(id: string): Promise<string | undefined> {
      await load()
      return entries.find(entry => entry.id === id)?.icon
    },
    cacheDir,
  }
}
