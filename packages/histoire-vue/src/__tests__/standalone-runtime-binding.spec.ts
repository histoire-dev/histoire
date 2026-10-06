import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createStandaloneCommands } from '../../../histoire-app/src/app/standalone/commands.js'
import { createStandaloneRuntimeBinding } from '../../../histoire-app/src/app/standalone/runtime-binding.js'
import { createStandaloneRuntimeTests } from '../../../histoire-app/src/app/standalone/runtime-tests.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

vi.mock('virtual:$histoire-commands', () => ({ registeredCommands: [] }))
vi.mock('virtual:$histoire-stories', () => ({ files: [{ component: {}, story: { id: 'a:b', title: 'First', variants: [{ id: 'c', title: 'One' }, { id: 'other', title: 'Other' }] } }], onUpdate: () => () => {} }))

/** Root routes without a primary; two real sessions retain distinct mounted documents. */
async function runtimeFixture() {
  const sources = [sourceFixture(), sourceFixture(), sourceFixture()]
  const sessions = sources.map(source => createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters))
  await Promise.all(sessions.map(session => session.connect()))
  const [canonical, first, second] = sessions
  await canonical.selection.select({ storyId: 'a:b', variantId: 'c' })
  await first.selection.select({ storyId: 'a:b', variantId: 'c' })
  await second.selection.select({ storyId: 'a:b', variantId: 'other' })
  await Promise.all([first, second].map(session => session.mount(document.createElement('div'), { surface: 'preview' }).ready))
  await Promise.all([first, second].map(session => session.state.get()))
  const binding = createStandaloneRuntimeBinding(canonical)
  return { sources, canonical, first, second, binding, async close() {
    binding.close()
    await Promise.all(sessions.map(session => session.dispose()))
  } }
}

describe('standalone selected runtime services', () => {
  it('edits selected retained frame and cancels late plugin writes when canonical route changes', async () => {
    const test = await runtimeFixture()
    const commands = createStandaloneCommands(test.canonical, createRouter({ history: createMemoryHistory(), routes: [] }), test.binding)
    const pending = deferred<void>()
    try {
      test.binding.bind(test.first)
      expect(commands.context().currentVariant?.state.count).toBe(5)
      await commands.execute({ id: 'edit', label: 'Edit', clientAction(_params, context) {
        context.currentVariant.state.count = 8
      } }, {})
      expect(test.first.getSnapshot().state?.value.count).toBe(8)
      expect(test.second.getSnapshot().state?.value.count).toBe(5)
      const late = commands.execute({ id: 'late', label: 'Late', async clientAction(_params, context) {
        await pending.promise
        context.currentVariant.state.count = 99
      } }, {})
      const rejected = late.catch(error => error)
      await Promise.resolve()
      await test.canonical.selection.select({ storyId: 'a:b', variantId: 'other' })
      test.binding.bind(test.second)
      expect(await rejected).toMatchObject({ code: 'DISPOSED' })
      pending.resolve()
      await Promise.resolve()
      expect(test.first.getSnapshot().state?.value.count).toBe(8)
      expect(test.sources[0].adapters.mount).not.toHaveBeenCalled()
    }
    finally {
      pending.resolve()
      commands.close()
      await test.close()
    }
  })

  it('shares automatic definitions from selected frame without running or disposing retained documents', async () => {
    const test = await runtimeFixture()
    const collect = vi.spyOn(test.first.tests, 'collect').mockResolvedValue({ definitions: [{ id: 'first', name: 'First', fullName: 'First' }] })
    const otherCollect = vi.spyOn(test.second.tests, 'collect').mockResolvedValue({ definitions: [{ id: 'other', name: 'Other', fullName: 'Other' }] })
    const run = vi.spyOn(test.first.tests, 'run')
    const tests = createStandaloneRuntimeTests(test.binding)
    try {
      test.binding.bind(test.first)
      await vi.waitFor(() => expect(tests.model.state.value.collection?.definitions[0].id).toBe('first'))
      expect(tests.model.session).toBe(test.first)
      await test.canonical.selection.select({ storyId: 'a:b', variantId: 'other' })
      test.binding.bind(test.first)
      expect(test.binding.current.value).toBe(test.canonical)
      test.binding.bind(test.second)
      await vi.waitFor(() => expect(tests.model.state.value.collection?.definitions[0].id).toBe('other'))
      expect(tests.model.session).toBe(test.second)
      expect(collect).toHaveBeenCalledOnce()
      expect(otherCollect).toHaveBeenCalledOnce()
      expect(run).not.toHaveBeenCalled()
      expect(test.sources.slice(1).every(source => !source.surfaceClose.mock.calls.length)).toBe(true)
    }
    finally {
      tests.close()
      await test.close()
    }
  })

  it('retires runtime consumers when root closes before canvas teardown', async () => {
    const test = await runtimeFixture()
    const commands = createStandaloneCommands(test.canonical, createRouter({ history: createMemoryHistory(), routes: [] }), test.binding)
    const tests = createStandaloneRuntimeTests(test.binding)
    try {
      test.binding.bind(test.first)
      await test.canonical.dispose()
      expect(test.binding.current.value).toBe(test.canonical)
      await expect(tests.model.controller.collect()).rejects.toMatchObject({ code: 'DISPOSED' })
      await expect(commands.execute({ id: 'retired', label: 'Retired', clientAction: vi.fn() }, {})).rejects.toMatchObject({ code: 'DISPOSED' })
      expect(test.sources[1].surfaceClose).not.toHaveBeenCalled()
    }
    finally {
      tests.close()
      commands.close()
      await test.close()
    }
  })
})
