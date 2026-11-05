import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'pathe'

/** Validated cached JSON and source freshness. */
export interface CacheResult<T> {
  /** Parsed response. */ value: T
  /** Past TTL; refresh failed or was skipped by a read-only lookup. */ stale: boolean
}
/** Persisted response envelope. */
interface CacheEntry<T = unknown> {
  /** Fetch completion time. */ at: number
  /** Untrusted JSON revalidated on every read. */ value: T
}

/** Retained response with serialized byte accounting. */
interface MemoryEntry extends CacheEntry {
  /** UTF-8 bytes of key and serialized envelope. */ bytes: number
}
/** One dev generation's project-wide LRU metadata. */
interface MemoryStore {
  /** Insertion order tracks least to most recently used. */ entries: Map<string, MemoryEntry>
  /** Total retained serialized bytes. */ bytes: number
  /** Retired stores reject late asynchronous publication. */ active: boolean
}
/** Normalized project roots own independent memory budgets. */
const stores = new Map<string, MemoryStore>()

/** Release generation metadata and fence already running fetches from republishing it. */
export function clearRegistryMemory(root: string): void {
  const key = resolve(root)
  const store = stores.get(key)
  if (store) {
    store.active = false
    store.entries.clear()
    store.bytes = 0
    stores.delete(key)
  }
}

/** Remove one retained entry, preserving byte accounting on replacement and eviction. */
function forget(store: MemoryStore, key: string): void {
  const previous = store.entries.get(key)
  if (previous) store.bytes -= previous.bytes
  store.entries.delete(key)
}

/** Retain only serializable responses fitting the project budget, evicting oldest reads first. */
function remember(store: MemoryStore, key: string, entry: CacheEntry): void {
  if (!store.active) return
  forget(store, key)
  try {
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(entry))
    if (bytes > 32 * 1024 * 1024) return
    while (store.entries.size >= 200 || store.bytes + bytes > 32 * 1024 * 1024) {
      forget(store, store.entries.keys().next().value)
    }
    store.entries.set(key, { ...entry, bytes })
    store.bytes += bytes
  }
  catch { /* Uncacheable responses still reach their online caller. */ }
}

/** Project-shared bounded metadata, with per-client identical in-flight work sharing. */
export function createRegistryCache(root: string, now: () => number = Date.now) {
  root = resolve(root)
  const directory = join(root, 'node_modules/.cache/histoire/marketplace/registry')
  let memory = stores.get(root)
  if (!memory) {
    memory = { entries: new Map(), bytes: 0, active: true }
    stores.set(root, memory)
  }
  const pending = new Map<string, Promise<CacheResult<unknown>>>()

  /** Hash credential-free registry keys into safe disk filenames. */
  function filename(key: string): string {
    return join(directory, `${createHash('sha256').update(key).digest('hex')}.json`)
  }

  /** Validate retained data before use; disk reads never create or rewrite files. */
  async function readEntry<T>(key: string, parse: (value: unknown) => T): Promise<CacheEntry<T> | undefined> {
    if (!memory.active) return
    const cached = memory.entries.get(key)
    if (cached) {
      try {
        if (cached.at > now()) throw new Error('Invalid cache time')
        const value = parse(cached.value)
        // Promote reads without resetting fetch time or serializing the payload again.
        memory.entries.delete(key)
        memory.entries.set(key, cached)
        return { at: cached.at, value }
      }
      catch { forget(memory, key) }
    }
    try {
      const raw = await readFile(filename(key), 'utf8')
      if (Buffer.byteLength(raw) > 9 * 1024 * 1024) return
      const entry = JSON.parse(raw)
      if (typeof entry.at !== 'number' || !Number.isFinite(entry.at) || entry.at > now()) return
      const validated = { at: entry.at, value: parse(entry.value) }
      remember(memory, key, validated)
      return validated
    }
    catch { /* Invalid or absent cache is a miss. */ }
  }

  /** Read generation memory, then disk, without fetching, waiting on fetches or writing. */
  async function read<T>(key: string, parse: (value: unknown) => T): Promise<CacheResult<T> | undefined> {
    const cached = await readEntry(key, parse)
    if (cached) return { value: cached.value, stale: now() - cached.at >= 3600000 }
  }

  /** Read fresh data, or preserve validated stale data when refresh fails. */
  async function get<T>(key: string, parse: (value: unknown) => T, fetch: () => Promise<unknown>): Promise<CacheResult<T>> {
    if (pending.has(key)) return pending.get(key) as Promise<CacheResult<T>>
    /** Disk errors affect caching only, never online registry availability. */
    const run = async (): Promise<CacheResult<T>> => {
      const file = filename(key)
      const cached = await readEntry(key, parse)
      if (cached && now() - cached.at < 3600000) {
        return { value: cached.value, stale: false }
      }
      try {
        const value = parse(await fetch())
        const entry = { at: now(), value }
        remember(memory, key, entry)
        const temporary = `${file}.${randomUUID()}.tmp`
        try {
          if (memory.active) {
            await mkdir(directory, { recursive: true })
            await writeFile(temporary, JSON.stringify(entry))
            if (memory.active) await rename(temporary, file)
          }
        }
        catch { /* Read-only projects still receive online results. */ }
        finally { await rm(temporary, { force: true }).catch(() => {}) }
        return { value, stale: false }
      }
      catch (error) {
        if (cached) return { value: cached.value, stale: true }
        throw error
      }
    }
    const promise = run().finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
  return { get, read }
}
