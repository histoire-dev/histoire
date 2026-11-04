import type { HistoireCatalogStory, HistoireJsonValue } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { createDesignModel } from '../workbench/model.js'

/**
 * Catalog story whose variant `a` declares the given designs.
 * @param design Value of `meta.design`.
 * @param id Story id.
 */
function story(design: unknown, id = 'button'): HistoireCatalogStory {
  return { id, title: 'Button', path: [], docsOnly: false, content: { docs: false, rawSource: false }, variants: [{ id: 'a', title: 'A', meta: { design } as never }, { id: 'b', title: 'B' }] }
}

/**
 * Promise settled from outside, to hold a catalog fetch in flight.
 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * Plugin API double with a controllable catalog.
 * @param initial Story returned before any catalog change; `undefined` makes fetches fail.
 */
function createApi(initial: HistoireCatalogStory | undefined) {
  let current = initial
  let onCatalog: () => void = () => {}
  const values = new Map<string, HistoireJsonValue>()
  const getStory = vi.fn(async (storyId: string) => {
    if (!current) throw new Error(`Story ${storyId} not found`)
    return storyId === current.id ? current : { ...current, id: storyId }
  })
  const api = {
    context: { catalog: { getStory, subscribe: (listener: () => void) => {
      onCatalog = listener
      return () => {}
    } } },
    preferences: { get: (key: string, fallback: HistoireJsonValue) => values.get(key) ?? fallback, set: (key: string, value: HistoireJsonValue) => values.set(key, value) },
    invalidate: vi.fn(),
    signal: new AbortController().signal,
  }
  /**
   * Publishes a new catalog version of the story.
   * @param next Updated story; `undefined` makes fetches fail.
   */
  const publish = (next: HistoireCatalogStory | undefined) => {
    current = next
    onCatalog()
  }
  return { api, publish, values }
}

const options = { embedHost: 'histoire', baseUrl: 'https://book.test/' }
const target = { storyId: 'button', variantId: 'a' }
const twoLinks = [{ type: 'link', url: 'https://one.test' }, { type: 'link', url: 'https://two.test' }]

describe('design model', () => {
  it('loads a story on first read and tells surfaces when designs become available', async () => {
    const { api } = createApi(story({ type: 'link', url: 'https://example.com' }))
    const model = createDesignModel(api as never, options)
    expect(model.has(target)).toBe(false)
    await vi.waitFor(() => expect(model.has(target)).toBe(true))
    expect(api.invalidate).toHaveBeenCalled()
    expect(model.has({ storyId: 'button', variantId: 'b' })).toBe(false)
    expect(model.has({ storyId: 'button', variantId: null })).toBe(false)
    expect(api.context.catalog.getStory).toHaveBeenCalledTimes(1)
  })

  it('refreshes loaded stories after a catalog publication without dropping them meanwhile', async () => {
    const { api, publish } = createApi(story({ type: 'link', url: 'https://example.com' }))
    const model = createDesignModel(api as never, options)
    model.get(target)
    await vi.waitFor(() => expect(model.has(target)).toBe(true))
    publish(story(twoLinks))
    expect(model.has(target)).toBe(true)
    await vi.waitFor(() => expect(model.get(target)?.designs).toHaveLength(2))
  })

  it('reports a failed load instead of loading forever and retries after a publication', async () => {
    const { api, publish } = createApi(undefined)
    const model = createDesignModel(api as never, options)
    const listener = vi.fn()
    model.subscribe(listener)
    model.get(target)
    await vi.waitFor(() => expect(model.get(target)?.error).toBe('Story button not found'))
    expect(listener).toHaveBeenCalled()
    expect(model.has(target)).toBe(true)
    publish(story({ type: 'link', url: 'https://example.com' }))
    await vi.waitFor(() => expect(model.get(target)?.error).toBeUndefined())
    expect(model.get(target)?.designs).toHaveLength(1)
  })

  it('notifies once per change and stays quiet when a publication leaves designs unchanged', async () => {
    const { api, publish } = createApi(story(twoLinks))
    const model = createDesignModel(api as never, options)
    model.get(target)
    await vi.waitFor(() => expect(model.has(target)).toBe(true))
    const listener = vi.fn()
    model.subscribe(listener)
    publish(story(twoLinks))
    await vi.waitFor(() => expect(api.context.catalog.getStory).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve))
    expect(listener).not.toHaveBeenCalled()
    publish(story([twoLinks[1]]))
    await vi.waitFor(() => expect(model.get(target)?.designs).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('refetches after the in-flight fetch when a publication arrives meanwhile', async () => {
    const { api, publish } = createApi(story(twoLinks))
    const held = deferred<HistoireCatalogStory>()
    api.context.catalog.getStory.mockImplementationOnce(() => held.promise)
    const model = createDesignModel(api as never, options)
    model.get(target)
    publish(story([twoLinks[0]]))
    held.resolve(story(twoLinks))
    await vi.waitFor(() => expect(model.get(target)?.designs).toHaveLength(1))
    expect(api.context.catalog.getStory).toHaveBeenCalledTimes(2)
  })

  it('only refreshes recently read stories after a publication', async () => {
    const { api, publish } = createApi(story(twoLinks))
    const model = createDesignModel(api as never, options)
    for (let index = 0; index < 40; index++) model.get({ storyId: `story-${index}`, variantId: 'a' })
    await vi.waitFor(() => expect(model.has({ storyId: 'story-39', variantId: 'a' })).toBe(true))
    api.context.catalog.getStory.mockClear()
    publish(story(twoLinks))
    await new Promise(resolve => setTimeout(resolve))
    expect(api.context.catalog.getStory.mock.calls.length).toBeLessThan(40)
    expect(api.context.catalog.getStory).toHaveBeenCalledWith('story-39')
  })

  it('remembers the selected design by entry index and falls back to the first valid one', async () => {
    const { api, values } = createApi(story([{ type: 'unknown' }, ...twoLinks]))
    const model = createDesignModel(api as never, options)
    model.get(target)
    await vi.waitFor(() => expect(model.has(target)).toBe(true))
    expect(model.active(target)?.externalUrl).toBe('https://one.test/')
    const listener = vi.fn()
    model.subscribe(listener)
    model.select(target, 2)
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    expect(model.active(target)?.externalUrl).toBe('https://two.test/')
    model.select(target, 9)
    expect(model.active(target)?.externalUrl).toBe('https://one.test/')
    for (const tampered of [-1, 1.5, '2', null]) {
      values.set('active:button:a', tampered)
      expect(model.active(target)?.externalUrl).toBe('https://one.test/')
    }
  })

  it('preloads a story so availability is known before the first read', async () => {
    const { api } = createApi(story({ type: 'link', url: 'https://example.com' }))
    const model = createDesignModel(api as never, options)
    await model.preload('button')
    expect(model.has(target)).toBe(true)
    expect(api.context.catalog.getStory).toHaveBeenCalledTimes(1)
  })
})
