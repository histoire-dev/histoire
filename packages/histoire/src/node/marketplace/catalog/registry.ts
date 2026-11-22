import type { RegistryPackument } from './registry-entry.js'
import { z } from 'zod'
import { createRegistryCache } from './cache.js'
import { fetchMarketplaceJson } from './fetch-json.js'
import { registryPackumentUrl, resolveNpmConfig } from './npm-config.js'
import { packumentSchema } from './registry-entry.js'
import { packageName } from './validation.js'

/** External registry controls; production always uses a five-second deadline. */
export interface RegistryOptions {
  /** Test endpoint overriding default and scoped npm registry settings. */ registryUrl?: string
  /** Request and complete catalog-refresh deadline in milliseconds. */ timeoutMs?: number
  /** Cache clock, allowing deterministic TTL tests. */ now?: () => number
}
/** Validated npm search page. */
const searchSchema = z.object({ objects: z.array(z.object({ package: z.object({ name: packageName }) })).max(250), total: z.number().int().min(0).max(100000) })

/** npm-only metadata client: validated, deduplicated, cached, bounded and code-free. */
export function createRegistryClient(root: string, options: RegistryOptions = {}) {
  let config: ReturnType<typeof resolveNpmConfig> | undefined
  /** Resolve once per client, only after consent allows a registry operation. */
  const settings = () => config ??= resolveNpmConfig(root, options.registryUrl)
  const timeout = Math.min(options.timeoutMs ?? 5000, 5000)
  const cache = createRegistryCache(root, options.now)
  /** Fetch/cache one search page against a fixed keyword rather than a user query. */
  async function search(from: number, signal: AbortSignal) {
    const config = await settings()
    const url = new URL('-/v1/search', config.registryFor())
    url.searchParams.set('text', 'keywords:histoire-plugin')
    url.searchParams.set('size', '250')
    url.searchParams.set('from', String(from))
    return cache.get(url.href, value => searchSchema.parse(value), () => fetchMarketplaceJson(url.href, 2 * 1024 * 1024, signal, config.authorizationFor(url.href)))
  }
  /** Exact identity fetch, also available to inventory and job consumers. */
  function packument(id: string, signal?: AbortSignal) {
    packageName.parse(id)
    return fetchPackument(id, signal)
  }
  /** Keep config loading asynchronous while rejecting invalid package names synchronously. */
  async function fetchPackument(id: string, signal?: AbortSignal) {
    const deadline = AbortSignal.timeout(timeout)
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
    const config = await settings()
    const url = registryPackumentUrl(config, id)
    const result = await cache.get(url, value => validateIdentity(packumentSchema.parse(value), id), () => fetchMarketplaceJson(url, 8 * 1024 * 1024, requestSignal, config.authorizationFor(url)))
    validateIdentity(result.value, id)
    return result
  }
  /** Planning reads existing memory/disk metadata without fetching or persisting anything. */
  async function cachedPackument(id: string) {
    packageName.parse(id)
    const config = await settings()
    const result = await cache.read(registryPackumentUrl(config, id), value => validateIdentity(packumentSchema.parse(value), id))
    if (result) validateIdentity(result.value, id)
    return result
  }
  /** Search every page before local filtering; a whole refresh shares one deadline. */
  async function catalog() {
    const signal = AbortSignal.timeout(timeout)
    const names = new Set<string>()
    let from = 0
    let stale = false
    while (true) {
      const page = await search(from, signal)
      stale ||= page.stale
      for (const item of page.value.objects) names.add(item.package.name)
      from += page.value.objects.length
      if (from >= page.value.total) break
      if (!page.value.objects.length) throw new Error('Incomplete registry search')
    }
    const ids = [...names]
    const entries: Awaited<ReturnType<typeof packument>>[] = []
    let position = 0
    // Bound concurrent HTTP requests even for a large registry search result.
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
      while (position < ids.length) entries.push(await packument(ids[position++], signal))
    }))
    stale ||= entries.some(entry => entry.stale)
    return { packuments: entries.map(entry => entry.value), stale }
  }
  return { packument, cachedPackument, catalog }
}

/** Check every cache boundary, including memory inserted by other registry consumers. */
function validateIdentity(value: RegistryPackument, id: string): RegistryPackument {
  if (value.name !== id || !Object.hasOwn(value.versions, value['dist-tags'].latest)) throw new Error('Invalid registry identity or latest version')
  return value
}
