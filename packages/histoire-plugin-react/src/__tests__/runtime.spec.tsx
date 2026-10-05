import type { Component } from '@histoire/vendors/vue'
import { nextTick } from '@histoire/vendors/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MountStory from '../client/mount.js'
import RenderStory from '../client/render.js'
import { collectStory } from '../collect/index.js'
import { Story } from '../components/Story.js'
import { Variant } from '../components/Variant.js'
import { collectionPayload, mountAdapter, runtimeStory } from './fixtures.js'

/** Owned Vue hosts, disposed before next test. */
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach(close => close()))

/** Mount adapter and wait for its ready contract. */
async function mount(component: Component, props: Record<string, unknown>) {
  const host = mountAdapter(component, props)
  cleanup.push(host.close)
  await host.ready
  return host.target
}

describe('react story collection', () => {
  it('collects metadata and generated ids without executing variant content', async () => {
    const content = vi.fn(() => <button type="button">Hidden</button>)
    const payload = collectionPayload()
    await collectStory(() => (
      <Story title="Buttons" group="ui">
        <Variant title="Normal">{content}</Variant>
        <Variant id="disabled" title="Disabled">{content}</Variant>
      </Story>
    ), payload)
    expect(payload.storyData).toMatchObject([{ id: 'button', title: 'Buttons', group: 'ui', variants: [{ id: 'button-0', title: 'Normal' }, { id: 'disabled', title: 'Disabled' }] }])
    expect(content).not.toHaveBeenCalled()
    expect(payload.el.childNodes).toHaveLength(0)
  })

  it('collects implicit variant and respects explicit story id', async () => {
    const payload = collectionPayload()
    await collectStory(() => <Story id="custom"><button type="button">Implicit</button></Story>, payload)
    expect(payload.storyData[0]).toMatchObject({ id: 'custom', variants: [{ id: '_default', title: 'default' }] })
  })
})

describe('react runtime adapters', () => {
  /** Story exercises inherited state, controls, source, and setup providers. */
  function Example() {
    return (
      <Story
        initState={() => ({ label: 'Hi', nested: { count: 1 } })}
        controls={({ state }) => (
          <span>{`Control ${state.label}`}</span>
        )}
      >
        <Variant title="Normal" source="explicit source">
          {({ state }) => (
            <button type="button">
              {state.label}
              {' '}
              {state.nested.count}
            </button>
          )}
        </Variant>
        <Variant
          title="Disabled"
          controls={({ state }) => (
            <span>{`Override ${state.label}`}</span>
          )}
        >
          <button type="button" disabled>Disabled</button>
        </Variant>
      </Story>
    )
  }

  it('configures all variants, inherits controls, and renders only selected content', async () => {
    const story = runtimeStory(Example)
    await mount(MountStory, { story })
    expect(story.meta).toMatchObject({ hasVariantChildComponents: true })
    expect(story.variants.every(variant => variant.configReady && variant.slots?.().controls)).toBe(true)
    expect(story.variants[0].source).toBe('explicit source')
    const target = await mount(RenderStory, { story, variant: story.variants[0] })
    expect(target.textContent).toBe('Hi 1')
    story.variants[0].state.label = 'Changed'
    story.variants[0].state.nested.count = 2
    await vi.waitFor(() => expect(target.textContent).toBe('Changed 2'))
    expect(target.querySelectorAll('button')).toHaveLength(1)
  })

  it('renders selected controls and variant state independently', async () => {
    const story = runtimeStory(Example)
    await mount(MountStory, { story })
    const target = await mount(RenderStory, { story, variant: story.variants[1], slotName: 'controls' })
    expect(target.textContent).toBe('Override Hi')
    story.variants[1].state.label = 'Second'
    await vi.waitFor(() => expect(target.textContent).toBe('Override Second'))
    expect(story.variants[0].state.label).toBe('Hi')
  })

  it('supports implicit state and reports absent controls', async () => {
    const story = runtimeStory(() => <Story initState={() => ({ label: 'Implicit' })}>{({ state }) => <p>{state.label}</p>}</Story>, ['_default'])
    await mount(MountStory, { story })
    expect(story.variants[0].slots?.().controls).toBe(false)
    const target = await mount(RenderStory, { story, variant: story.variants[0] })
    expect(target.textContent).toBe('Implicit')
  })

  it('calls setup with Root and selection, and installs wrappers', async () => {
    const setupApp = vi.fn(({ app, story, variant, addWrapper }) => {
      expect(app.render).toBeTypeOf('function')
      expect(story.id).toBe('button')
      expect(variant.id).toBe('_default')
      addWrapper(({ children }) => <section aria-label="provider">{children}</section>)
    })
    const story = runtimeStory(() => <Story setupApp={setupApp}><p>Wrapped</p></Story>, ['_default'])
    await mount(MountStory, { story })
    const target = await mount(RenderStory, { story, variant: story.variants[0] })
    expect(setupApp).toHaveBeenCalledOnce()
    expect(target.querySelector('section')?.textContent).toBe('Wrapped')
    await nextTick()
  })
})
