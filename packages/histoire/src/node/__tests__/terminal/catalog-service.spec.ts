import type { CatalogListPage, CatalogVariantsPage } from '@histoire/cli/protocol/catalog'
import type { TerminalBridgeEvent } from '../../../../../histoire-cli/src/terminal/bridge.js'
import { Buffer } from 'node:buffer'
import { CATALOG_PAGE_BYTES, CATALOG_STALE_MESSAGE } from '@histoire/cli/protocol/catalog'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCatalogHarness } from './catalog-harness.js'

type Harness = Awaited<ReturnType<typeof createCatalogHarness>>

/** Reads every page of a list with the contracted continuation arguments. */
async function readAll(harness: Harness, query?: string) {
  const pages: CatalogListPage[] = []
  for (let page = await harness.bridge.send('catalog.list', { query }); ; page = await harness.bridge.send('catalog.list', { query, cursor: pages.at(-1)!.next, expectedRevision: pages.at(-1)!.revision })) {
    pages.push(page)
    if (!page.next) return pages
  }
}

describe('child catalog pages', () => {
  let harness: Harness
  beforeEach(async () => {
    harness = await createCatalogHarness()
  })
  afterEach(async () => {
    await harness.close()
  })

  it('pages at most 100 stories of one revision and finds a search match beyond the first page', async () => {
    await harness.publish(Array.from({ length: 250 }, (_, index) => ({ id: `story-${index}`, title: `Story ${index}`, variants: index === 233 ? ['needle-variant', 'plain'] : ['plain'] })))
    const pages = await readAll(harness)
    expect(pages.map(page => page.stories.length)).toEqual([100, 100, 50])
    expect(new Set(pages.map(page => page.revision)).size).toBe(1)
    expect(pages.flatMap(page => page.stories).map(story => story.id).sort()).toEqual(Array.from({ length: 250 }, (_, index) => `story-${index}`).sort())
    expect(pages[0].state).toMatchObject({ stories: 250, variants: 250 + 1, updating: false, outcome: 'success' })

    // Search runs over the whole catalog on the child: the variant-only match lives on the third page.
    const found = await readAll(harness, 'NEEDLE')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ total: 1, stories: [{ id: 'story-233', matchedVariants: 1 }] })
    // File labels and IDs are searched too.
    expect((await readAll(harness, 'story-24'))[0].stories.map(story => story.id).sort()).toEqual(['story-24', ...Array.from({ length: 10 }, (_, index) => `story-24${index}`)].sort())
  })

  it('refuses to continue after the catalog moved on, and reports no source or content', async () => {
    await harness.publish(Array.from({ length: 150 }, (_, index) => ({ id: `s${index}` })))
    const first = await harness.bridge.send('catalog.list', {})
    await harness.publish([{ id: 'only' }])
    await expect(harness.bridge.send('catalog.list', { cursor: first.next, expectedRevision: first.revision })).rejects.toMatchObject({ code: 'failed', message: CATALOG_STALE_MESSAGE })
    await expect(harness.bridge.send('catalog.variants', { storyId: 'only', expectedRevision: first.revision })).rejects.toMatchObject({ code: 'failed', message: CATALOG_STALE_MESSAGE })
    // A restarted read sees exactly the new catalog.
    const restarted = await harness.bridge.send('catalog.list', {})
    expect(restarted.stories.map(story => story.id)).toEqual(['only'])
    expect(Object.keys(restarted.stories[0]).sort()).toEqual(['docsOnly', 'filePath', 'id', 'title', 'variantCount'])
    await expect(harness.bridge.send('catalog.list', { cursor: '1' } as never)).rejects.toMatchObject({ code: 'invalid' })
  })

  it('bounds pages by serialized bytes without losing any story', async () => {
    // Quotes double when serialized, so each entry is far larger than its 1 KiB ID.
    const wide = '"'.repeat(1000)
    await harness.publish(Array.from({ length: 100 }, (_, index) => ({ id: `${wide}${index}`, title: 'x'.repeat(1000) })))
    const pages = await readAll(harness)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(CATALOG_PAGE_BYTES + 4096)
    const ids = pages.flatMap(page => page.stories.map(story => story.id))
    expect(ids.sort()).toEqual(Array.from({ length: 100 }, (_, index) => `${wide}${index}`).sort())
    // Display text is cut visibly; the ID never is.
    expect(pages[0].stories[0].title.endsWith('…')).toBe(true)
  })

  it('pages variants separately and marks matches, ambiguity and unusable stories', async () => {
    await harness.publish([
      { id: 'big', variants: Array.from({ length: 130 }, (_, index) => `v${index}`) },
      { id: 'twin' },
      { id: 'twin', title: 'Second twin' },
      { id: 'repeat', variants: ['same', 'same'] },
    ])
    const list = await harness.bridge.send('catalog.list', {})
    expect(list.stories.filter(story => story.ambiguous).map(story => story.id)).toEqual(['twin', 'twin'])
    await expect(harness.bridge.send('catalog.variants', { storyId: 'twin' })).rejects.toMatchObject({ code: 'invalid', message: 'Story ID is ambiguous' })
    await expect(harness.bridge.send('catalog.variants', { storyId: 'missing' })).rejects.toMatchObject({ code: 'invalid' })

    const first: CatalogVariantsPage = await harness.bridge.send('catalog.variants', { storyId: 'big', query: 'v12' })
    expect(first).toMatchObject({ total: 130, next: '100' })
    expect(first.variants).toHaveLength(100)
    // Matches beyond this page (v120..v129) are marked on their own page.
    expect(first.variants.filter(variant => variant.matched).map(variant => variant.id)).toEqual(['v12'])
    const second = await harness.bridge.send('catalog.variants', { storyId: 'big', cursor: first.next, expectedRevision: first.revision })
    expect(second.variants.map(variant => variant.id)).toEqual(Array.from({ length: 30 }, (_, index) => `v${index + 100}`))
    expect(second.next).toBeUndefined()
    expect((await harness.bridge.send('catalog.variants', { storyId: 'repeat' })).variants.every(variant => variant.ambiguous)).toBe(true)
  })

  it('announces revisions and the updating fence once each, only to its generation', async () => {
    const events: TerminalBridgeEvent[] = []
    harness.bridge.subscribe(event => events.push(event))
    await harness.publish([{ id: 'a' }])
    // The service observes only after the first read (lazy per generation).
    await harness.bridge.send('catalog.list', {})
    events.length = 0
    await harness.publish([{ id: 'a' }, { id: 'b' }])
    const states = events.filter(event => event.event === 'catalog.state').map(event => event.data as { revision?: string, updating: boolean, stories: number })
    expect(states.map(state => [state.updating, state.stories])).toEqual([[true, 1], [false, 2]])
    expect(states[1].revision).not.toBe(states[0].revision)
  })
})
