import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'

/** Registry logos are small monochrome SVGs; anything larger is refused. */
export const AGENT_ICON_BYTES = 64 * 1024

/** Accepts SVG documents only; raster or HTML bodies are refused. */
function isSvg(body: string): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(body)
}

/**
 * Fetches and caches registry agent logos on the server so the browser only loads
 * same-origin SVGs (rendered as CSS masks) and never contacts the registry CDN.
 */
export function createAgentRegistryIcons(options: {
  /** User cache directory shared with the registry. */
  cacheDir: string
  /** Remote boundary, injectable for tests. */
  fetch?: typeof fetch
  /** Resolves a validated registry entry's HTTPS logo URL. */
  iconUrl: (id: string) => Promise<string | undefined>
}) {
  const memory = new Map<string, Promise<string | undefined>>()
  /** Disk cache path; ids are validated registry identities (`[\w-]`). */
  function file(id: string): string {
    return path.join(options.cacheDir, 'icons', `${id}.svg`)
  }
  /** Loads one logo from disk or the registry CDN. */
  async function load(id: string): Promise<string | undefined> {
    const cached = await readFile(file(id), 'utf8').catch(() => undefined)
    if (cached && isSvg(cached)) return cached
    const url = await options.iconUrl(id)
    if (!url) return undefined
    const response = await (options.fetch ?? fetch)(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
    if (!response.ok) return undefined
    const body = await response.text()
    if (Buffer.byteLength(body) > AGENT_ICON_BYTES || !isSvg(body)) return undefined
    const temporary = path.join(options.cacheDir, 'icons', `.${id}-${randomUUID()}.tmp`)
    // Disk caching is best effort; the in-memory copy still serves this session.
    try {
      await mkdir(path.dirname(temporary), { recursive: true })
      await writeFile(temporary, body, { flag: 'wx' })
      await rename(temporary, file(id))
    }
    catch { /* Read-only user cache. */ }
    finally { await rm(temporary, { force: true }).catch(() => {}) }
    return body
  }
  return {
    /**
     * SVG body for a registry agent, or `undefined` when it has no usable logo.
     * Failures are not memoized so a later request can retry.
     */
    get(id: string): Promise<string | undefined> {
      if (!/^[\w-]{1,80}$/.test(id)) return Promise.resolve(undefined)
      let pending = memory.get(id)
      if (!pending) {
        pending = load(id).catch(() => undefined).then((body) => {
          if (!body) memory.delete(id)
          return body
        })
        memory.set(id, pending)
      }
      return pending
    },
  }
}
