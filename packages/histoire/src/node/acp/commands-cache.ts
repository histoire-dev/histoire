import type { UiAgentCommand } from '@histoire/shared'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'

/** Cached commands of one project root. */
interface CommandsCacheProject {
  /** Last write time (ms), used to evict the oldest projects. */
  updatedAt: number
  /** Commands keyed by agent preset id. */
  agents: Record<string, UiAgentCommand[]>
}

/** Cached commands keyed by project root. */
type CommandsCacheData = Record<string, CommandsCacheProject>

/** Most recently written project roots kept in the cache file. */
const MAX_PROJECTS = 20
/** Attempts to write when another process changes the file meanwhile. */
const WRITE_ATTEMPTS = 3

/**
 * Parses the cache file; unreadable or invalid content counts as empty.
 * @param raw File content.
 */
function parse(raw: string | undefined): CommandsCacheData {
  try {
    const value = raw ? JSON.parse(raw) : {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    // The file is user-editable: drop malformed projects.
    return Object.fromEntries(Object.entries(value).flatMap(([root, project]) => {
      const entry = project as CommandsCacheProject | undefined
      if (typeof entry?.updatedAt === 'number' && entry.agents && typeof entry.agents === 'object') return [[root, entry]]
      // Earlier layout mapped agent ids straight to command lists; it counts as the oldest write.
      if (entry && typeof entry === 'object' && Object.values(entry).every(Array.isArray)) return [[root, { updatedAt: 0, agents: entry as unknown as CommandsCacheProject['agents'] }]]
      return []
    })) as CommandsCacheData
  }
  catch { return {} }
}

/**
 * Keeps only the most recently written project roots.
 * @param data Whole cache.
 */
function evict(data: CommandsCacheData): CommandsCacheData {
  return Object.fromEntries(Object.entries(data).sort(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, MAX_PROJECTS))
}

/**
 * Last slash commands each agent announced, kept beside the user's agent settings so they survive dev server restarts.
 * @param dataFile User-level `agents.json`; the cache sits in the same folder.
 * @param root Project root scoping the cached commands.
 */
export function createAgentCommandsCache(dataFile: string, root: string) {
  const file = path.join(path.dirname(dataFile), 'agent-commands.json')
  let writes: Promise<void> = Promise.resolve()
  /** Raw file content, or undefined when missing. */
  const raw = () => readFile(file, 'utf8').catch(() => undefined)
  /**
   * Writes one agent's commands atomically. Another dev server may write between our read and rename;
   * re-reading just before the rename and retrying on change keeps its update instead of overwriting it.
   */
  async function write(agentId: string, commands: UiAgentCommand[]): Promise<void> {
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const before = await raw()
      const data = parse(before)
      if (JSON.stringify(data[root]?.agents[agentId]) === JSON.stringify(commands)) return
      const agents = { ...data[root]?.agents, [agentId]: commands }
      // Strictly newest even within one millisecond, so eviction never depends on key order.
      const newest = Math.max(0, ...Object.values(data).map(project => project.updatedAt))
      data[root] = { updatedAt: Math.max(Date.now(), newest + 1), agents }
      await mkdir(path.dirname(file), { recursive: true })
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify(evict(data))}\n`, { flag: 'wx' })
        if (await raw() !== before) continue
        await rename(temporary, file)
        return
      }
      finally { await rm(temporary, { force: true }) }
    }
  }
  return {
    /** Commands of this project's agents. */
    async load(): Promise<Record<string, UiAgentCommand[]>> {
      const project = parse(await raw())[root]
      if (!project) return {}
      // Only well-formed rows; the file is user-editable.
      return Object.fromEntries(Object.entries(project.agents).map(([id, list]) => [id, Array.isArray(list) ? list.filter(command => typeof command?.name === 'string' && typeof command.description === 'string') : []]))
    },
    /**
     * Replace one agent's commands; writes are serialized, atomic and skipped when unchanged.
     * @param agentId Agent preset id.
     * @param commands Newest commands.
     */
    save(agentId: string, commands: UiAgentCommand[]): Promise<void> {
      writes = writes.then(() => write(agentId, commands)).catch(() => {})
      return writes
    },
    /** Settles once every queued write finished. */
    flush: (): Promise<void> => writes,
  }
}

/**
 * In-memory commands per agent, seeded from and saved to the user cache.
 * @param dataFile User-level `agents.json`.
 * @param root Project root.
 * @param changed Publishes a new agents snapshot.
 */
export function createAgentCommands(dataFile: string, root: string, changed: () => void) {
  const map = new Map<string, UiAgentCommand[]>()
  const cache = createAgentCommandsCache(dataFile, root)
  return {
    map,
    /** Seed agents not yet announced in this process. */
    async load(): Promise<void> {
      for (const [id, list] of Object.entries(await cache.load())) {
        if (!map.has(id)) map.set(id, list)
      }
    },
    /**
     * Publish and persist an agent's newest commands; an unchanged list does nothing.
     * @param agentId Agent preset id.
     * @param list Newest commands.
     */
    remember(agentId: string, list: UiAgentCommand[]): void {
      if (JSON.stringify(map.get(agentId)) === JSON.stringify(list)) return
      map.set(agentId, list)
      void cache.save(agentId, list)
      changed()
    },
    /**
     * Names of an agent's last announced or cached commands.
     * @param agentId Agent preset id.
     */
    names: (agentId: string): string[] => (map.get(agentId) ?? []).map(command => command.name),
    /** Settles once pending cache writes finished. */
    flush: () => cache.flush(),
  }
}
