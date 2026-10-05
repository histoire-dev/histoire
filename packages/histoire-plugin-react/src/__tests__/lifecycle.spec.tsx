import type { ReactStorySetupApi } from '../helpers.js'
import { nextTick, reactive } from '@histoire/vendors/vue'
import { useLayoutEffect } from 'react'
import { expect, it, vi } from 'vitest'
import MountStory from '../client/mount.js'
import RenderStory from '../client/render.js'
import { Story } from '../components/Story.js'
import { Variant } from '../components/Variant.js'
import { mountAdapter, runtimeStory } from './fixtures.js'

it('observes preview state changed by child layout effects before subscription', async () => {
  /** Child layout effects run before the variant subscribes to Vue state. */
  function Content({ state }: { state: { value: number } }) {
    useLayoutEffect(() => {
      state.value = 1
    }, [state])
    return <span>{state.value}</span>
  }
  const story = runtimeStory(() => <Story>{({ state }) => <Content state={state as { value: number }} />}</Story>, ['_default'])
  story.variants[0].state.value = 0
  const host = mountAdapter(RenderStory, { story, variant: story.variants[0] })
  try {
    await host.ready
    expect(story.variants[0].state.value).toBe(1)
    await vi.waitFor(() => expect(host.target.textContent).toBe('1'))
  }
  finally { host.close() }
})

it.each(['story', 'variant'] as const)('cancels setup after asynchronous %s setup outlives preview root', async (stage) => {
  let finish!: () => void
  const delayed = new Promise<void>(resolve => finish = resolve)
  const storySetup = vi.fn((_api: ReactStorySetupApi) => stage === 'story' ? delayed : undefined)
  const variantSetup = vi.fn((_api: ReactStorySetupApi) => stage === 'variant' ? delayed : undefined)
  const story = runtimeStory(() => <Story setupApp={storySetup}><Variant setupApp={variantSetup}>Preview</Variant></Story>, ['button-0'])
  const configuration = mountAdapter(MountStory, { story })
  await configuration.ready
  configuration.close()
  const onReady = vi.fn()
  const host = mountAdapter(RenderStory, { story, variant: story.variants[0] }, onReady)
  try {
    await vi.waitFor(() => expect(stage === 'story' ? storySetup : variantSetup).toHaveBeenCalledOnce())
  }
  finally { host.close() }
  const api = (stage === 'story' ? storySetup : variantSetup).mock.calls[0][0]
  expect(api.isActive?.()).toBe(false)
  finish()
  await delayed
  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  expect(onReady).not.toHaveBeenCalled()
  if (stage === 'story') expect(variantSetup).not.toHaveBeenCalled()
})

it('runs asynchronous story and variant setup after configuration root is released', async () => {
  const order: string[] = []
  const story = runtimeStory(() => (
    <Story
      setupApp={async () => {
        await Promise.resolve()
        order.push('story')
        return ({ children }) => <section aria-label="story provider">{children}</section>
      }}
    >
      <Variant
        setupApp={async () => {
          await Promise.resolve()
          order.push('variant')
          return ({ children }) => <section aria-label="variant provider">{children}</section>
        }}
      >
        Preview
      </Variant>
    </Story>
  ), ['button-0'])
  const configuration = mountAdapter(MountStory, { story })
  await configuration.ready
  configuration.close()
  const onReady = vi.fn()
  const host = mountAdapter(RenderStory, { story, variant: story.variants[0] }, onReady)
  try {
    await host.ready
    expect(order).toEqual(['story', 'variant'])
    expect(onReady).toHaveBeenCalledOnce()
    expect(host.target.querySelector('[aria-label="story provider"] [aria-label="variant provider"]')?.textContent).toBe('Preview')
  }
  finally { host.close() }
})

it('drops asynchronous initialization after root is unmounted', async () => {
  let finish!: (value: { label: string }) => void
  const initialized = new Promise<{ label: string }>(resolve => finish = resolve)
  const initState = vi.fn(() => initialized)
  const story = runtimeStory(() => <Story initState={initState}><p>Hidden</p></Story>, ['_default'])
  const onReady = vi.fn()
  const host = mountAdapter(MountStory, { story }, onReady)
  await vi.waitFor(() => expect(initState).toHaveBeenCalledOnce())
  host.close()
  finish({ label: 'Late' })
  await nextTick()
  await initialized
  expect(onReady).not.toHaveBeenCalled()
  expect(story.variants[0].state).toEqual({})
  expect(story.variants[0].configReady).toBeUndefined()
})

it('replaces selected variants and handles updated story components', async () => {
  /** Two declarations make stale selection visible. */
  function Example() {
    return (
      <Story>
        <Variant><p>First</p></Variant>
        <Variant><p>Second</p></Variant>
      </Story>
    )
  }
  const story = runtimeStory(Example)
  const props = reactive({ story, variant: story.variants[0] })
  const host = mountAdapter(RenderStory, props)
  try {
    await host.ready
    expect(host.target.textContent).toBe('First')
    props.variant = story.variants[1]
    await vi.waitFor(() => expect(host.target.textContent).toBe('Second'))
    story.file!.component = () => (
      <Story>
        <Variant><p>New first</p></Variant>
        <Variant><p>Updated</p></Variant>
      </Story>
    )
    await vi.waitFor(() => expect(host.target.textContent).toBe('Updated'))
  }
  finally { host.close() }
})
