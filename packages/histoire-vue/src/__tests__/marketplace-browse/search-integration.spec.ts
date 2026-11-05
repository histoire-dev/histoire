import { afterEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { browseFixture, catalogPage } from './fixture.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanups.splice(0).reverse()) dispose()
  vi.useRealTimers()
})

// Acceptance gate intentionally exercises shared store, rather than treating the
// passing client adapter test as proof that header-driven searches are debounced.
it.each([false, true])('sends one catalog request after rapid search changes (adapter injected: %s)', async (debounce) => {
  const page = await catalogPage()
  vi.useFakeTimers()
  const fixture = await browseFixture('all', { debounce })
  cleanups.push(fixture.dispose)
  await vi.advanceTimersByTimeAsync(150)
  await fixture.reply(page)
  const before = fixture.channel.sent.length
  fixture.store.setQuery('a')
  await nextTick()
  fixture.store.setQuery('ax')
  await nextTick()
  fixture.store.setQuery('axe')
  await nextTick()
  await vi.advanceTimersByTimeAsync(150)
  expect(fixture.channel.sent.slice(before)).toHaveLength(1)
  expect(fixture.request().value.query.query).toBe('axe')
  expect(fixture.channel.listenerCount()).toBe(1)
  await fixture.reply({ ...page, total: 1, entries: [page.entries[0]] })
})
