import { readdir, readFile, stat } from 'node:fs/promises'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import { clearRegistryMemory, createRegistryCache } from '../../marketplace/catalog/cache.js'
import { configTestProject, disposeConfigProjects } from '../utils/config-codemod.js'
import { deferred } from '../utils/mcp/deferred.js'
import { denyRegistryCacheWrites } from './catalog-cache-fixture.js'

/** Real parser rejects invalid retained metadata on every access. */
const schema = z.string()
afterEach(disposeConfigProjects)

// Real cache with real permission-denied filesystem. Fetch callbacks model only
// external responses. Exact survivors distinguish LRU from FIFO and excess
// retention; controlled clock distinguishes unchanged fetch time from renewed TTL.
describe('generation registry cache', () => {
  it('shares 200 entries per normalized root and evicts least recently read metadata', async () => {
    const { root } = await configTestProject()
    await denyRegistryCacheWrites(root)
    onTestFinished(() => clearRegistryMemory(root))
    const cache = createRegistryCache(root)
    for (let i = 0; i < 200; i++) await cache.get(`package-${i}`, schema.parse, async () => `release-${i}`)
    const reader = createRegistryCache(`${root}/.`)
    expect(await reader.read('package-0', schema.parse)).toEqual({ value: 'release-0', stale: false })
    await cache.get('package-200', schema.parse, async () => 'release-200')
    expect(await reader.read('package-1', schema.parse)).toBeUndefined()
    expect(await reader.read('package-0', schema.parse)).toEqual({ value: 'release-0', stale: false })
    for (let i = 2; i <= 200; i++) expect((await reader.read(`package-${i}`, schema.parse))?.value).toBe(`release-${i}`)
  })

  it('caps retained bytes at 32 MiB and accounts for replacement sizes', async () => {
    const { root } = await configTestProject()
    await denyRegistryCacheWrites(root)
    onTestFinished(() => clearRegistryMemory(root))
    const cache = createRegistryCache(root)
    // Four payloads exceed 32 MiB once JSON envelope/key bytes are included.
    const payload = 'x'.repeat(8 * 1024 * 1024)
    for (const key of ['old', 'hot', 'third']) await cache.get(key, schema.parse, async () => payload)
    expect((await cache.read('old', schema.parse))?.value.length).toBe(payload.length)
    await cache.get('fourth', schema.parse, async () => payload)
    expect(await cache.read('hot', schema.parse)).toBeUndefined()
    for (const key of ['old', 'third', 'fourth']) expect((await cache.read(key, schema.parse))?.value.length).toBe(payload.length)
    // Expired replacement must subtract old size before admitting its new size.
    const later = createRegistryCache(root, () => Date.now() + 3600001)
    await later.get('old', schema.parse, async () => 'small')
    await later.get('fifth', schema.parse, async () => payload)
    expect((await later.read('old', schema.parse))?.value).toBe('small')
    for (const key of ['third', 'fourth', 'fifth']) expect((await later.read(key, schema.parse))?.value.length).toBe(payload.length)
  })

  it('returns oversized online data without retaining it or evicting useful entries', async () => {
    const { root } = await configTestProject()
    await denyRegistryCacheWrites(root)
    onTestFinished(() => clearRegistryMemory(root))
    const cache = createRegistryCache(root)
    await cache.get('kept', schema.parse, async () => 'kept')
    const oversized = 'x'.repeat(32 * 1024 * 1024)
    expect((await cache.get('large', schema.parse, async () => oversized)).value.length).toBe(oversized.length)
    expect(await cache.read('large', schema.parse)).toBeUndefined()
    expect(await cache.read('kept', schema.parse)).toEqual({ value: 'kept', stale: false })
  })

  it('retains fetch time across readers, serves stale on errors, and reads disk without writes', async () => {
    const { root } = await configTestProject()
    onTestFinished(() => clearRegistryMemory(root))
    let now = 1000
    let requests = 0
    /** External refresh result, observable through distinct values and count. */
    const fetch = async () => {
      requests++
      return 'first'
    }
    await createRegistryCache(root, () => now).get('package', schema.parse, fetch)
    now += 3600000 - 1
    const cache = createRegistryCache(root, () => now)
    expect(await cache.get('package', schema.parse, fetch)).toEqual({ value: 'first', stale: false })
    expect(requests).toBe(1)
    now++
    expect(await cache.read('package', schema.parse)).toEqual({ value: 'first', stale: true })
    expect(await cache.get('package', schema.parse, async () => {
      throw new Error('offline')
    })).toEqual({ value: 'first', stale: true })
    expect(await cache.get('package', schema.parse, async () => 'refreshed')).toEqual({ value: 'refreshed', stale: false })
    clearRegistryMemory(root)
    const directory = `${root}/node_modules/.cache/histoire/marketplace/registry`
    const files = await readdir(directory)
    const file = `${directory}/${files[0]}`
    const bytes = await readFile(file, 'utf8')
    const before = await stat(file)
    const reader = createRegistryCache(root, () => now)
    expect(await reader.read('package', schema.parse)).toEqual({ value: 'refreshed', stale: false })
    expect(await reader.read('missing', schema.parse)).toBeUndefined()
    expect(await readdir(directory)).toEqual(files)
    expect(await readFile(file, 'utf8')).toBe(bytes)
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs)
  })

  it('isolates project roots and cannot publish a held fetch into a disposed generation', async () => {
    const { root } = await configTestProject()
    const other = await configTestProject()
    await denyRegistryCacheWrites(root)
    await denyRegistryCacheWrites(other.root)
    onTestFinished(() => {
      clearRegistryMemory(root)
      clearRegistryMemory(other.root)
    })
    const cache = createRegistryCache(root)
    await cache.get('same', schema.parse, async () => 'original')
    const peer = createRegistryCache(other.root)
    await peer.get('same', schema.parse, async () => 'other')
    const entered = deferred()
    const released = deferred()
    const pending = cache.get('held', schema.parse, async () => {
      entered.resolve()
      await released.promise
      return 'retired'
    })
    onTestFinished(async () => {
      released.resolve()
      await pending
    })
    await entered.promise
    clearRegistryMemory(root)
    const next = createRegistryCache(root)
    expect(await next.read('same', schema.parse)).toBeUndefined()
    await next.get('held', schema.parse, async () => 'current')
    released.resolve()
    await pending
    expect(await next.read('held', schema.parse)).toEqual({ value: 'current', stale: false })
    expect(await cache.read('held', schema.parse)).toBeUndefined()
    expect(await peer.read('same', schema.parse)).toEqual({ value: 'other', stale: false })
  })
})
