import type { CatalogHarness } from './catalog-harness.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewHostRig, press as key, stripSgr } from '../../../../../histoire-cli/src/__tests__/utils/terminal/view-host.js'
import { getTestTargetHandoff } from '../../../../../histoire-cli/src/terminal/stories/handoff.js'
import { createStoriesView } from '../../../../../histoire-cli/src/terminal/views/stories.js'
import { settleTimers } from '../utils/flush.js'
import { createCatalogHarness } from './catalog-harness.js'

const closers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

/** Stories view over a real catalog, with only the browser and clipboard as doubles. */
async function openStories(options: { routerMode?: 'hash' | 'history', base?: string, stories: Parameters<CatalogHarness['publish']>[0] }) {
  // Warm the lazily loaded route helpers so a settled timer turn covers URL resolution.
  await import('@histoire/cli/workbench-url')
  const harness = await createCatalogHarness(options)
  closers.push(() => harness.close())
  await harness.publish(options.stories)
  harness.ready()
  const rig = createViewHostRig({ bridge: harness.bridge, progress: harness.progress, url: `http://localhost:6006${options.base ?? '/'}`, rows: 14 })
  const host = rig.host
  const view = createStoriesView(host)
  view.enter?.()
  const press = (...inputs: string[]) => inputs.forEach(input => view.handleKey!(key(input)))
  const screen = () => stripSgr(view.render!(host.size()).join('\n'))
  // Target URLs resolve after the route helpers load, so opened addresses are read once pending work settled.
  const opened = async () => {
    await settleTimers()
    return vi.mocked(host.openBrowser).mock.calls.map(call => call[0])
  }
  return { harness, rig, host, view, press, screen, opened, handoff: getTestTargetHandoff(host) }
}

describe('stories view', () => {
  it('opens the exact requested story and variant, not the first item', async () => {
    const stories = await openStories({ stories: [{ id: 'alpha', variants: ['a1', 'a2'] }, { id: 'beta', title: 'Beta book', variants: ['b1', 'b2', 'b3'] }] })
    await vi.waitFor(() => expect(stories.screen()).toContain('Beta book'))
    expect(stories.rig.panelSegments()).toEqual(['2 stories, 5 variants'])
    stories.press('down', 'return')
    await vi.waitFor(() => expect(stories.screen()).toContain('b3'))
    stories.press('down', 'down', 'return')
    expect(await stories.opened()).toEqual(['http://localhost:6006/story/beta?variantId=b3'])
    // `o` on the story list opens the story route; no variant is invented.
    stories.press('escape', 'o')
    expect((await stories.opened()).at(-1)).toBe('http://localhost:6006/story/beta')
  })

  it.each([
    ['history', 'http://localhost:6006/book/story/s%2Fa%3F%20%23%25?variantId=v+1%2F%23'],
    ['hash', 'http://localhost:6006/book/#/story/s%2Fa%3F%20%23%25?variantId=v+1%2F%23'],
  ] as const)('builds %s router URLs under a non-root base with exact encoded IDs', async (routerMode, expected) => {
    const stories = await openStories({ routerMode, base: '/book/', stories: [{ id: 's/a? #%', variants: ['v 1/#'] }] })
    await vi.waitFor(() => expect(stories.screen()).toContain('s/a? #%'))
    stories.press('return')
    await vi.waitFor(() => expect(stories.screen()).toContain('v 1/#'))
    stories.press('return')
    expect(await stories.opened()).toEqual([expected])
  })

  it('opens a dot-only story ID through the query route and a story without variants through its story route', async () => {
    const stories = await openStories({ stories: [{ id: '..', variants: ['main'] }, { id: 'empty', variants: [] }] })
    await vi.waitFor(() => expect(stories.screen()).toContain('empty'))
    // Sorted: `..` first.
    stories.press('return')
    await vi.waitFor(() => expect(stories.screen()).toContain('main'))
    stories.press('return')
    expect(await stories.opened()).toEqual(['http://localhost:6006/story?variantId=main&storyId=..'])
    stories.press('escape', 'down', 'return')
    // Enter on a story with no variant opens its route directly.
    expect((await stories.opened()).at(-1)).toBe('http://localhost:6006/story/empty')
    stories.press('t')
    expect(stories.handoff.current()).toBeUndefined()
  })

  it('clears actionability when the selected variant is removed and requires the new catalog to confirm a restarted target', async () => {
    const stories = await openStories({ stories: [{ id: 'a', variants: ['one', 'two'] }] })
    await vi.waitFor(() => expect(stories.screen()).toContain('2 variants'))
    stories.press('return')
    await vi.waitFor(() => expect(stories.screen()).toContain('two'))
    stories.press('down')

    await stories.harness.publish([{ id: 'a', variants: ['one'] }])
    await vi.waitFor(() => expect(stories.screen()).toContain('Selected variant is not in the catalog'))
    stories.press('o', 't')
    expect(await stories.opened()).toEqual([])
    expect(stories.handoff.current()).toBeUndefined()
    expect(stories.rig.notices.at(-1)).toBe('Selected variant is not in the catalog')

    // Same ID again, in a new generation: nothing is actionable until that generation answers.
    stories.harness.restarting()
    stories.press('o')
    expect(await stories.opened()).toEqual([])
    await stories.harness.publish([{ id: 'a', variants: ['one', 'two'] }])
    stories.harness.ready('g2')
    await vi.waitFor(() => expect(stories.screen()).toContain('two'))
    stories.press('o')
    expect(await stories.opened()).toEqual(['http://localhost:6006/story/a?variantId=two'])
  })

  it('opens the tests screen on the exact variant and runs it, and refuses a story without variants', async () => {
    const stories = await openStories({ stories: [{ id: 'a', variants: ['one', 'two'] }, { id: 'empty', variants: [] }] })
    await vi.waitFor(() => expect(stories.screen()).toContain('empty'))
    stories.press('return')
    await vi.waitFor(() => expect(stories.screen()).toContain('two'))
    // The run starts once the tests screen holds the handed-over variant.
    const runs: unknown[] = []
    vi.spyOn(stories.host.tests, 'run').mockImplementation(async () => {
      runs.push(stories.handoff.current()?.target)
      return { problem: 'A test run is already in progress' }
    })
    stories.press('down', 't')
    expect(stories.handoff.current()).toMatchObject({ target: { scope: 'variant', storyId: 'a', variantId: 'two' }, generation: 'g1', revision: expect.stringMatching(/:1$/) })
    expect(stories.host.openView).toHaveBeenCalledWith('t')
    expect(runs).toEqual([{ scope: 'variant', storyId: 'a', variantId: 'two' }])
    await vi.waitFor(() => expect(stories.rig.notices.at(-1)).toBe('A test run is already in progress'))

    stories.press('escape', 'down', 't')
    expect(stories.rig.notices.at(-1)).toBe('This story has no variants to test')
    expect(runs).toHaveLength(1)
    expect(stories.handoff.current()).toMatchObject({ target: { variantId: 'two' } })
  })

  it('searches the whole catalog, including variants beyond the first page', async () => {
    const stories = await openStories({ stories: Array.from({ length: 150 }, (_, index) => ({ id: `s${String(index).padStart(3, '0')}`, variants: index === 140 ? ['hidden-gem'] : ['plain'] })) })
    await vi.waitFor(() => expect(stories.screen()).toContain('100 of 150 stories'))
    stories.press('/')
    expect(stories.view.capturesInput!()).toBe(true)
    stories.press(...'gem'.split(''), 'return')
    expect(stories.view.capturesInput!()).toBe(false)
    await vi.waitFor(() => expect(stories.screen()).toContain('s140'))
    expect(stories.screen()).toContain('1 of 1 story')
  })

  it('selects the first match when a search drops the selection, and acts on it', async () => {
    const stories = await openStories({ stories: Array.from({ length: 150 }, (_, index) => ({ id: `s${String(index).padStart(3, '0')}`, variants: index === 140 ? ['hidden-gem'] : ['plain'] })) })
    await vi.waitFor(() => expect(stories.screen()).toContain('100 of 150 stories'))
    stories.harness.calls.length = 0
    stories.press('/', ...'gem'.split(''), 'return')
    await vi.waitFor(() => expect(stories.screen()).toContain('1 of 1 story'))
    expect(stories.screen()).not.toContain('not in the catalog')
    stories.press('o')
    expect(await stories.opened()).toEqual(['http://localhost:6006/story/s140'])
    // The old selection is not chased across the filtered pages.
    expect(stories.harness.calls.some(call => JSON.stringify(call.args).includes('"cursor"'))).toBe(false)
  })
})
