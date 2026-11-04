import type { Context } from '../../context.js'
import type { CollectionEvent } from '../../server/collect.js'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, expect, it, vi } from 'vitest'
import { createAffectedSelector } from '../../runtime/terminal/affected/selector.js'
import { createEligibilityProject } from '../utils/eligibility-project.js'

const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})

/**
 * Real Vite transforms: A and B share `shared.js`, C owns `c-only.js`, every
 * story reaches `setup.js`. `d` is opaque (`eval`) when requested.
 */
async function createFixture(options: { opaque?: boolean } = {}) {
  const stories = ['a', 'b', 'c', ...options.opaque ? ['d'] : []]
  const project = await createEligibilityProject({
    stories,
    files: {
      'shared.js': 'export const shared = 1',
      'c-only.js': 'export const only = 1',
      'a.story.js': 'import "./shared.js";export default {}',
      'b.story.js': 'import "./shared.js";export default {}',
      'c.story.js': 'import "./c-only.js";export default {}',
      'd.story.js': 'eval("1");export default {}',
    },
  })
  disposers.push(project.dispose)
  const collections = new Set<(event: CollectionEvent) => void | Promise<void>>()
  const controller = new AbortController()
  disposers.push(async () => controller.abort())
  const catalog = {
    current: {
      revision: 'r1',
      stories: stories.map(id => ({ id, filePath: `${id}.story.js`, docsOnly: false, variants: [{ id: 'main', title: 'Main' }] })),
    },
  }
  const selector = createAffectedSelector({
    handle: { context: project.ctx as Context, server: project.server, isActive: () => true, onCollection: (handler) => {
      collections.add(handler)
      return () => void collections.delete(handler)
    } },
    catalog: catalog as never,
    signal: controller.signal,
    settleMs: 10,
  })
  return { ...project, selector, catalog, collections, controller, file: (name: string) => join(project.root, name) }
}

const ids = (change: { storyIds: readonly string[] }) => [...change.storyIds].sort()

it('selects exactly the owners of an edited shared, story-only or setup module and nothing for independent modules', async () => {
  const { selector, file } = await createFixture()
  expect(await selector.refresh()).toBe(true)
  const shared = await selector.classify('change', file('shared.js'))
  expect({ reason: shared.reason, ids: ids(shared), conservative: shared.conservative }).toEqual({ reason: 'shared', ids: ['a', 'b'], conservative: false })
  // Edited graphs are outdated until re-analysis; settle before the next independent question.
  await selector.refresh()
  const only = await selector.classify('change', file('c-only.js'))
  expect({ reason: only.reason, ids: ids(only) }).toEqual({ reason: 'story', ids: ['c'] })
  await selector.refresh()
  const setup = await selector.classify('change', file('setup.js'))
  expect({ reason: setup.reason, ids: ids(setup) }).toEqual({ reason: 'setup', ids: ['a', 'b', 'c'] })
  await selector.refresh()
  const unrelated = await selector.classify('change', file('unrelated.ts'))
  expect({ reason: unrelated.reason, ids: ids(unrelated), whole: unrelated.whole }).toEqual({ reason: 'independent', ids: [], whole: false })
})

it('intersects with story and variant scope without broadening it', async () => {
  const { selector, file } = await createFixture()
  await selector.refresh()
  const shared = await selector.classify('change', file('shared.js'))
  expect(selector.select({ scope: 'all' }, [shared])).toMatchObject({ status: 'ok', storyIds: ['a', 'b'], reason: 'shared', conservative: false })
  expect(selector.select({ scope: 'variant', storyId: 'a', variantId: 'main' }, [shared]).targets).toEqual([{ scope: 'variant', storyId: 'a', variantId: 'main' }])
  expect(selector.select({ scope: 'story', storyId: 'c' }, [shared])).toMatchObject({ status: 'ok', storyIds: [], reason: 'independent' })
  expect(selector.select({ scope: 'story', storyId: 'gone' }, [shared])).toMatchObject({ status: 'missing', storyIds: [], missing: ['gone'] })
})

it('keeps the old graph through helper deletion and a replacement analysis cut short by an edit', async () => {
  const { selector, file, root, server } = await createFixture()
  await selector.refresh()
  await rm(join(root, 'shared.js'))
  const removed = await selector.classify('unlink', file('shared.js'))
  expect({ reason: removed.reason, ids: ids(removed) }).toEqual({ reason: 'shared', ids: ['a', 'b'] })
  // An edit during analysis retires the proof: the retained graph must survive.
  const replacement = selector.refresh()
  server.watcher.emit('all', 'change', file('shared.js'))
  expect(await replacement).toBe(false)
  expect(selector.status()).toMatchObject({ known: true, proven: 3 })
  const again = await selector.classify('unlink', file('shared.js'))
  expect(ids(again)).toEqual(['a', 'b'])
})

it('never excludes opaque stories but still excludes proven ones', async () => {
  const { selector, file } = await createFixture({ opaque: true })
  await selector.refresh()
  expect(selector.status()).toMatchObject({ proven: 3, unresolved: 1 })
  const unrelated = await selector.classify('change', file('unrelated.ts'))
  expect({ reason: unrelated.reason, ids: ids(unrelated), conservative: unrelated.conservative }).toEqual({ reason: 'unresolved', ids: ['d'], conservative: true })
  expect(selector.select({ scope: 'all' }, [unrelated]).storyIds).toEqual(['d'])
  expect(selector.select({ scope: 'story', storyId: 'a' }, [unrelated]).storyIds).toEqual([])
})

it('selects the whole scope before any analysis and for structural events, but not for ignored paths', async () => {
  const { selector, file } = await createFixture()
  expect(await selector.classify('change', file('unrelated.ts'))).toMatchObject({ reason: 'unresolved', whole: true })
  await selector.refresh()
  for (const [event, name] of [['add', 'new.ts'], ['unlink', 'unrelated.ts'], ['change', 'tsconfig.json']]) {
    await selector.refresh()
    expect(await selector.classify(event, file(name))).toMatchObject({ reason: 'structural', whole: true, conservative: true })
  }
  for (const [event, name] of [['add', '.nuxt/ui/button.ts'], ['change', 'node_modules/installed/index.js']]) {
    expect(await selector.classify(event, file(name))).toMatchObject({ reason: 'ignored', whole: false, storyIds: [] })
  }
})

it('selects owners of an unwatched leaf that changed, once per change', async () => {
  const { selector, setVirtualData, collections } = await createFixture()
  await selector.refresh()
  setVirtualData('export const preference = "dark"')
  const heard: unknown[] = []
  selector.onChange(change => heard.push(change))
  const event = { phase: 'completed', files: [], outcomes: new Map() } as CollectionEvent
  for (const handler of collections) await handler(event)
  await vi.waitFor(() => expect(heard).toHaveLength(1))
  expect(heard[0]).toMatchObject({ reason: 'leaf', storyIds: expect.arrayContaining(['a', 'b', 'c']) })
  // The completed collection also refreshed the index: the new bytes are the baseline.
  await vi.waitFor(async () => expect(await selector.checkLeaves()).toBeUndefined())
})

it('reports edits to listeners and recovers precision after re-analysis', async () => {
  const { selector, file, server } = await createFixture()
  await selector.refresh()
  const heard: string[][] = []
  selector.onChange(change => heard.push(ids(change)))
  await writeFile(file('c.story.js'), 'import "./c-only.js";import "./shared.js";export default {}')
  server.watcher.emit('all', 'change', file('c.story.js'))
  // Until re-analysis, c's retained graph is outdated and c is never excluded.
  expect(selector.status().stale).toBe(1)
  await vi.waitFor(() => expect(heard).toEqual([['c']]))
  await vi.waitFor(() => expect(selector.status().stale).toBe(0))
  const shared = await selector.classify('change', file('shared.js'))
  expect(ids(shared)).toEqual(['a', 'b', 'c'])
  expect(shared.conservative).toBe(false)
})

it('stops observing and re-analysis while detached and observes again once attached', async () => {
  const { selector, file, server, collections } = await createFixture()
  await selector.refresh()
  const heard: string[][] = []
  selector.onChange(change => heard.push(ids(change)))
  selector.detach()
  expect(collections.size).toBe(0)
  server.watcher.emit('all', 'change', file('c.story.js'))
  await new Promise(done => setTimeout(done, 60))
  expect(heard).toEqual([])
  expect(selector.status().stale).toBe(0)

  selector.attach()
  selector.attach()
  expect(collections.size).toBe(1)
  server.watcher.emit('all', 'change', file('c.story.js'))
  await vi.waitFor(() => expect(heard).toEqual([['c']]))
})
