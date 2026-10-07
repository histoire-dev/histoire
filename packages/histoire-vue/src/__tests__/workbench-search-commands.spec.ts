import type { ClientCommand } from '@histoire/shared'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import { createStandaloneCommands } from '../../../histoire-app/src/app/standalone/commands.js'
import { createStandaloneRuntimeBinding } from '../../../histoire-app/src/app/standalone/runtime-binding.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { virtualViewport } from './fixtures/virtual-viewport.js'

vi.mock('@histoire/vue/internal', () => import('../internal.js'))
const registry = vi.hoisted(() => ({ commands: [] as ClientCommand[] }))
vi.mock('virtual:$histoire-commands', () => ({
  get registeredCommands() {
    return registry.commands
  },
}))
vi.mock('virtual:$histoire-stories', () => ({ files: [{ component: {}, story: { id: 'a:b', title: 'First', variants: [{ id: 'c', title: 'One' }] } }], onUpdate: () => () => {} }))
beforeEach(() => virtualViewport())
afterEach(() => vi.restoreAllMocks())

/** Mount current Search against actual session metadata and route command context. */
async function commandSearch(command: ClientCommand, boundRuntime = false) {
  registry.commands = [command]
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/story/:storyId', component: {} }] })
  await router.push('/story/a:b?variantId=c&tab=events')
  const binding = boundRuntime ? createStandaloneRuntimeBinding(session) : undefined
  const commands = createStandaloneCommands(session, router, binding)
  const error = vi.fn()
  const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session }, slots: { default: () => h(SearchPanel, { commands, onError: error }) } })
  await wrapper.get('input[type=search]').setValue('>Review')
  await vi.waitFor(() => expect(wrapper.find('[data-search-kind=command]').exists()).toBe(true))
  return { fixture, session, wrapper, error, binding, async close() {
    wrapper.unmount()
    commands.close()
    binding?.close()
    await session.dispose()
  } }
}

describe('current Search command contracts', () => {
  it('resolves direct parameters from live route/story/variant context and invokes once', async () => {
    const getParams = vi.fn(context => ({ selected: context.currentVariant.id }))
    const action = vi.fn()
    const owner = await commandSearch({ id: 'review', label: 'Review', getParams, clientAction: action })
    try {
      await owner.wrapper.get('input[type=search]').trigger('keydown', { key: 'Enter' })
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      expect(getParams).toHaveBeenCalledOnce()
      expect(getParams.mock.calls[0][0]).toMatchObject({ route: { params: { storyId: 'a:b' }, query: { variantId: 'c', tab: 'events' } }, currentStory: { id: 'a:b' }, currentVariant: { id: 'c' } })
      expect(action.mock.calls[0][0]).toEqual({ selected: 'c' })
    }
    finally { await owner.close() }
  })

  it('focuses prompts, preserves dependent defaults and answers, then submits once', async () => {
    const getParams = vi.fn(context => ({ ...context.answers, variant: context.currentVariant.id }))
    const action = vi.fn()
    const owner = await commandSearch({ id: 'review', label: 'Review', prompts: [
      { type: 'text', field: 'name', label: 'Name', defaultValue: 'Initial' },
      { type: 'text', field: 'slug', label: 'Slug', defaultValue: answers => `${answers.name}-slug` },
    ], getParams, clientAction: action })
    try {
      await owner.wrapper.get('[data-search-kind=command]').trigger('click')
      expect(action).not.toHaveBeenCalled()
      const fields = owner.wrapper.findAll('form input')
      await vi.waitFor(() => expect(document.activeElement).toBe(fields[0].element))
      expect((fields[1].element as HTMLInputElement).value).toBe('Initial-slug')
      await fields[0].setValue('Changed')
      expect((fields[1].element as HTMLInputElement).value).toBe('Changed-slug')
      await fields[1].setValue('custom')
      await owner.wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      expect(getParams).toHaveBeenCalledOnce()
      expect(action.mock.calls[0][0]).toEqual({ name: 'Changed', slug: 'custom', variant: 'c' })
      expect(owner.wrapper.find('form').exists()).toBe(false)
    }
    finally { await owner.close() }
  })

  it('escape cancels live prompts without invoking parameters or action', async () => {
    const getParams = vi.fn()
    const action = vi.fn()
    const owner = await commandSearch({ id: 'review', label: 'Review', prompts: [{ type: 'text', field: 'name', label: 'Name' }], getParams, clientAction: action })
    try {
      await owner.wrapper.get('[data-search-kind=command]').trigger('click')
      await owner.wrapper.get('form input').trigger('keyup', { key: 'Escape' })
      expect(owner.wrapper.find('form').exists()).toBe(false)
      expect(getParams).not.toHaveBeenCalled()
      expect(action).not.toHaveBeenCalled()
    }
    finally { await owner.close() }
  })

  it.each(['current', 'replacement', 'returned'] as const)('reports command errors only for %s bound same-target frame', async (retirement) => {
    const pending = deferred<void>()
    const action = vi.fn(() => pending.promise)
    const owner = await commandSearch({ id: 'review', label: 'Review', clientAction: action }, true)
    const frames = [sourceFixture(), sourceFixture()].map(fixture => createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters))
    try {
      for (const frame of frames) {
        await frame.connect()
        await frame.selection.select({ storyId: 'a:b', variantId: 'c' })
        await frame.mount(document.createElement('div'), { surface: 'preview' }).ready
      }
      owner.binding!.bind(frames[0])
      await owner.wrapper.get('[data-search-kind=command]').trigger('click')
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      if (retirement !== 'current') owner.binding!.bind(frames[1])
      if (retirement === 'returned') owner.binding!.bind(frames[0])
      expect(owner.session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
      expect(owner.binding!.current.value).toBe(frames[retirement === 'replacement' ? 1 : 0])
      await flushPromises()
      pending.reject(new Error('old frame command failed'))
      await flushPromises()
      if (retirement === 'current') expect(owner.error).toHaveBeenCalledOnce()
      else expect(owner.error).not.toHaveBeenCalled()
    }
    finally {
      await owner.close()
      await Promise.all(frames.map(frame => frame.dispose()))
    }
  })

  it.each(['current', 'selection', 'selection-returned', 'query-returned', 'source', 'closed'] as const)('reports rejected command only for %s owner', async (retirement) => {
    const pending = deferred<void>()
    const action = vi.fn(() => pending.promise)
    const owner = await commandSearch({ id: 'review', label: 'Review', clientAction: action })
    try {
      await owner.wrapper.get('[data-search-kind=command]').trigger('click')
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      if (retirement.startsWith('selection')) {
        await owner.session.selection.select({ storyId: 'a', variantId: 'b:c' })
        if (retirement === 'selection-returned') await owner.session.selection.select({ storyId: 'a:b', variantId: 'c' })
      }
      if (retirement === 'query-returned') {
        await owner.wrapper.get('input[type=search]').setValue('different')
        await owner.wrapper.get('input[type=search]').setValue('>Review')
      }
      if (retirement === 'source') {
        owner.fixture.descriptor.revision = 'replacement'
        owner.fixture.emitCatalog()
      }
      if (retirement === 'closed') owner.wrapper.unmount()
      pending.reject(new Error('command failed'))
      await flushPromises()
      if (retirement === 'current') expect(owner.error).toHaveBeenCalledOnce()
      else expect(owner.error).not.toHaveBeenCalled()
    }
    finally { await owner.close() }
  })
})
