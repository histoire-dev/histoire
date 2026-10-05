import { reactive } from '@histoire/vendors/vue'
import { expect, it, vi } from 'vitest'
import MountStory from '../client/mount.js'
import RenderStory from '../client/render.js'
import { Story } from '../components/Story.js'
import { Variant } from '../components/Variant.js'
import { mountAdapter, runtimeStory } from './fixtures.js'

it.each(['plain', 'reactive', 'nested-reactive'] as const)('isolates shared %s initial data across variant previews', async (kind) => {
  const defaults = {
    nested: { count: 0 },
    items: ['base'],
    created: new Date('2026-01-01T00:00:00.000Z'),
    missing: undefined,
    amount: 1n,
  }
  const initialState = kind === 'reactive'
    ? reactive(defaults)
    : kind === 'nested-reactive'
      ? { ...defaults, nested: reactive(defaults.nested), items: reactive(defaults.items) }
      : defaults
  /** Each initializer may reuse defaults; every variant must own its nested state. */
  function Example() {
    return (
      <Story initState={() => kind === 'reactive' ? initialState : { ...initialState }}>
        <Variant>
          {({ state }) => (
            <button
              type="button"
              onClick={() => {
                state.nested.count++
                state.items.push('extra')
              }}
            >
              {`${state.nested.count}:${state.items.length}`}
            </button>
          )}
        </Variant>
        <Variant>{({ state }) => <span>{`${state.nested.count}:${state.items.length}`}</span>}</Variant>
      </Story>
    )
  }
  const story = runtimeStory(Example)
  const configuration = mountAdapter(MountStory, { story })
  try {
    await configuration.ready
  }
  finally { configuration.close() }
  const first = mountAdapter(RenderStory, { story, variant: story.variants[0] })
  const second = mountAdapter(RenderStory, { story, variant: story.variants[1] })
  try {
    await Promise.all([first.ready, second.ready])
    first.target.querySelector('button')!.click()
    await vi.waitFor(() => expect(first.target.textContent).toBe('1:2'))
    expect(second.target.textContent).toBe('0:1')
    expect(story.variants[1].state.nested.count).toBe(0)
    expect(story.variants[1].state.items).toEqual(['base'])
    expect(defaults.nested.count).toBe(0)
    expect(defaults.items).toEqual(['base'])
    for (const variant of story.variants) {
      expect(variant.state.created).toBeInstanceOf(Date)
      expect(variant.state.created.toISOString()).toBe(defaults.created.toISOString())
      expect(variant.state.created).not.toBe(defaults.created)
      expect(variant.state).toHaveProperty('missing', undefined)
      expect(variant.state.amount).toBe(1n)
    }
  }
  finally {
    first.close()
    second.close()
  }
})

it('retains callbacks and opaque owners while isolating cyclic initial graphs', async () => {
  const callback = vi.fn()
  const owner = new AbortController()
  const nested = { count: 0, self: null as any }
  nested.self = nested
  const defaults = {
    nested,
    alias: reactive(nested),
    self: null as any,
    callback,
    owner,
    map: new Map([['nested', nested]]),
    set: new Set([nested]),
    bytes: new Uint8Array([1, 2]),
    pattern: /sample/gi,
  }
  defaults.self = defaults
  defaults.pattern.lastIndex = 2
  /** Cycles and callbacks remain valid local state, independent of wire serialization. */
  function Example() {
    return (
      <Story initState={() => defaults}>
        <Variant>
          {({ state }) => (
            <button
              type="button"
              onClick={() => {
                state.callback()
                state.nested.count++
                state.bytes[0] = 3
              }}
            >
              {state.nested.count}
            </button>
          )}
        </Variant>
        <Variant>{({ state }) => <span>{state.nested.count}</span>}</Variant>
      </Story>
    )
  }
  const story = runtimeStory(Example)
  const configuration = mountAdapter(MountStory, { story })
  try {
    await configuration.ready
  }
  finally { configuration.close() }
  const first = mountAdapter(RenderStory, { story, variant: story.variants[0] })
  const second = mountAdapter(RenderStory, { story, variant: story.variants[1] })
  try {
    await Promise.all([first.ready, second.ready])
    first.target.querySelector('button')!.click()
    await vi.waitFor(() => expect(first.target.textContent).toBe('1'))
    expect(second.target.textContent).toBe('0')
    expect(callback).toHaveBeenCalledOnce()
    expect(defaults.nested.count).toBe(0)
    expect(defaults.bytes[0]).toBe(1)
    expect(story.variants[1].state.bytes[0]).toBe(1)
    for (const variant of story.variants) {
      expect(variant.state.callback).toBe(callback)
      expect(variant.state.owner).toBe(owner)
      expect(variant.state.nested.self).toBe(variant.state.nested)
      expect(variant.state.alias).toBe(variant.state.nested)
      expect(variant.state.self).toBe(variant.state)
      expect(variant.state.map.get('nested')).toBe(variant.state.nested)
      expect(variant.state.set.has(variant.state.nested)).toBe(true)
      expect(variant.state.pattern).toBeInstanceOf(RegExp)
      expect(variant.state.pattern).not.toBe(defaults.pattern)
      expect(variant.state.pattern.flags).toBe('gi')
      expect(variant.state.pattern.lastIndex).toBe(2)
    }
  }
  finally {
    first.close()
    second.close()
  }
})
