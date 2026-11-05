import { afterEach, expect, it, vi } from 'vitest'
import { createDebouncedCatalogClient } from '../../../../histoire-app/src/app/components/marketplace/browse/catalog-client.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { createMarketplaceTransport } from '../utils/marketplace-transport.js'
import { catalogPage } from './fixture.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.useRealTimers()
})

// Timer algorithm exception: controlled clock tests delay/coalescing, while the
// real client and external channel still own correlation and listener cleanup.
it('coalesces typing at 150 ms, snapshots inputs, and retires active channel listeners', async () => {
  const page = await catalogPage()
  vi.useFakeTimers()
  const channel = createMarketplaceTransport()
  const client = createDebouncedCatalogClient(createMarketplaceClient({ transport: channel.transport }))
  cleanups.push(client.disposeCatalog)
  expect(createDebouncedCatalogClient(client)).toBe(client)
  const query = { view: 'all' as const, query: 'a', prefs: { community: false, packageManager: 'auto' as const, afterInstall: 'restart' as const, skippedVersions: {} } }
  const first = client.catalog(query).catch(error => error)
  query.query = 'ax'
  const second = client.catalog(query).catch(error => error)
  query.query = 'axe'
  const third = client.catalog(query).catch(error => error)
  query.query = 'mutated outside request'
  await vi.advanceTimersByTimeAsync(149)
  expect(channel.sent).toEqual([])
  await vi.advanceTimersByTimeAsync(1)
  expect(channel.sent).toHaveLength(1)
  expect(channel.sent[0].value.query.query).toBe('axe')
  expect(channel.listenerCount()).toBe(1)
  const final = client.catalog({ ...query, query: 'design' })
  expect(channel.listenerCount()).toBe(0)
  expect((await first).name).toBe('AbortError')
  expect((await second).name).toBe('AbortError')
  expect((await third).name).toBe('AbortError')
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: channel.sent[0].value.requestId, page: { ...page, total: 999 } })
  await vi.advanceTimersByTimeAsync(150)
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: channel.sent[1].value.requestId, page })
  expect((await final).total).toBe(10)
  expect(channel.listenerCount()).toBe(0)
})

it('aborts scheduled and active work on owner cancellation and allows a fresh visit', async () => {
  const page = await catalogPage()
  vi.useFakeTimers()
  const channel = createMarketplaceTransport()
  const client = createDebouncedCatalogClient(createMarketplaceClient({ transport: channel.transport }))
  cleanups.push(client.disposeCatalog)
  const query = { view: 'all' as const, prefs: { community: false, packageManager: 'auto' as const, afterInstall: 'restart' as const, skippedVersions: {} } }
  const controller = new AbortController()
  const delayed = client.catalog(query, { signal: controller.signal }).catch(error => error)
  controller.abort()
  await vi.advanceTimersByTimeAsync(150)
  expect((await delayed).name).toBe('AbortError')
  expect(channel.sent).toEqual([])
  const active = client.catalog(query).catch(error => error)
  await vi.advanceTimersByTimeAsync(150)
  expect(channel.listenerCount()).toBe(1)
  client.disposeCatalog()
  expect((await active).name).toBe('AbortError')
  expect(channel.listenerCount()).toBe(0)
  const fresh = client.catalog(query)
  await vi.advanceTimersByTimeAsync(150)
  channel.emit('histoire:ui:marketplace-catalog-result', { requestId: channel.sent.at(-1)!.value.requestId, page })
  expect(await fresh).toEqual(page)
})
