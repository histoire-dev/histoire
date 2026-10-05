import type { ClientCommandContext } from '@histoire/shared'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createStandaloneClientActions } from '../../../histoire-app/src/app/standalone/client-actions.js'
import { toRawDeep } from '../../../histoire-app/src/app/util/state.js'
import { createRuntimeState } from '../../../histoire-app/src/embed/adapters/state.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Extend shared session fixture with actual canonical runtime reconciliation, including omitted owners. */
async function commandFixture() {
  const fixture = sourceFixture()
  const callback = vi.fn()
  class Owner { value = 1 }
  const instance = new Owner()
  const live = { count: 2, nested: { label: 'before', keep: 'old', callback }, items: [{ label: 'first', callback }], instance }
  const runtime = createRuntimeState(() => live, value => toRawDeep(value, true))
  const dispatch = fixture.request.getMockImplementation()!
  fixture.request.mockImplementation(async (command, payload) => command === 'state.patch'
    ? { ...fixture.state(), value: runtime.patch(payload) }
    : command === 'state.get' ? { ...fixture.state(), value: runtime.get() } : dispatch(command, payload))
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount(document.createElement('div'), { surface: 'preview' }).ready
  await session.state.get()
  const actions = createStandaloneClientActions(session)
  const variant = { id: 'c', state: session.getSnapshot().state!.value }
  const context = { route: {}, currentVariant: variant, currentStory: { id: 'a:b', variants: [variant] } } as ClientCommandContext
  return { fixture, session, actions, live, callback, instance, context, async close() {
    actions.close()
    await session.dispose()
  } }
}

describe('legacy client command state intent', () => {
  it('flushes direct, nested and array edits through canonical runtime while retaining opaque owners', async () => {
    const fixture = await commandFixture()
    try {
      await fixture.actions.execute({ id: 'edit', label: 'Edit', clientAction(_params, context) {
        expect(context.currentStory.variants[0]).toBe(context.currentVariant)
        context.currentVariant.state.count++
        context.currentVariant.state.nested.label = 'edited'
        context.currentVariant.state.items.push({ label: 'second' })
        context.currentVariant.state.items[0].label = 'updated'
        context.currentVariant.state.instance.value = 7
      } }, {}, fixture.context)
      expect(fixture.live).toMatchObject({ count: 3, nested: { label: 'edited', keep: 'old' }, items: [{ label: 'updated' }, { label: 'second' }] })
      expect(fixture.live.nested.callback).toBe(fixture.callback)
      expect(fixture.live.items[0].callback).toBe(fixture.callback)
      expect(fixture.live.instance).toBe(fixture.instance)
      expect(fixture.instance.value).toBe(7)
      expect(fixture.session.getSnapshot().state!.value.count).toBe(3)
    }
    finally { await fixture.close() }
  })

  it('awaits callback and patches only mutated branches, preserving newer unrelated edits', async () => {
    const fixture = await commandFixture()
    const done = deferred<void>()
    const action = vi.fn(async (_params, context) => {
      context.currentVariant.state.nested.label = 'queued'
      await done.promise
      context.currentVariant.state.count++
    })
    try {
      const operation = fixture.actions.execute({ id: 'async', label: 'Async', clientAction: action }, {}, fixture.context)
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      await fixture.session.state.patch({ nested: { keep: 'newer' } })
      done.resolve()
      await operation
      expect(fixture.live.nested).toMatchObject({ label: 'queued', keep: 'newer' })
      expect(fixture.live.count).toBe(3)
    }
    finally {
      done.resolve()
      await fixture.close()
    }
  })

  it('rejects object deletion explicitly instead of reporting a local-only state edit as applied', async () => {
    const fixture = await commandFixture()
    try {
      await expect(fixture.actions.execute({ id: 'delete', label: 'Delete', clientAction(_params, context) {
        delete context.currentVariant.state.count
      } }, {}, fixture.context)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
      expect(fixture.live.count).toBe(2)
      expect(fixture.fixture.request.mock.calls.filter(([command]) => command === 'state.patch')).toHaveLength(0)
    }
    finally { await fixture.close() }
  })

  it('does not notify server action after disconnect before queued command starts', async () => {
    const fixture = await commandFixture()
    const notify = vi.fn()
    const action = vi.fn()
    try {
      const operation = fixture.actions.execute({ id: 'queued', label: 'Queued', clientAction: action }, {}, fixture.context, notify)
      fixture.fixture.emitDisconnect()
      await expect(operation).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
      expect(notify).not.toHaveBeenCalled()
      expect(action).not.toHaveBeenCalled()
    }
    finally { await fixture.close() }
  })

  it('notifies server once under initial guard and never re-emits after late cancelled callback', async () => {
    const fixture = await commandFixture()
    const notify = vi.fn()
    const done = deferred<void>()
    const action = vi.fn(async () => {
      await done.promise
    })
    try {
      const operation = fixture.actions.execute({ id: 'notify', label: 'Notify', clientAction: action }, {}, fixture.context, notify)
      const rejected = operation.catch(error => error)
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      expect(notify).toHaveBeenCalledOnce()
      fixture.fixture.emitDisconnect()
      expect(await rejected).toMatchObject({ code: 'NOT_CONNECTED' })
      done.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(notify).toHaveBeenCalledOnce()
      expect(fixture.fixture.request.mock.calls.filter(([command]) => command === 'state.patch')).toHaveLength(0)
    }
    finally {
      done.resolve()
      await fixture.close()
    }
  })

  it('rejects overtaken callback promptly and never applies late mutation to replacement target', async () => {
    const fixture = await commandFixture()
    const done = deferred<void>()
    const action = vi.fn(async (_params, context) => {
      await done.promise
      context.currentVariant.state.count = 99
    })
    try {
      const operation = fixture.actions.execute({ id: 'late', label: 'Late', clientAction: action }, {}, fixture.context)
      const rejected = operation.catch(error => error)
      await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
      await fixture.session.selection.select({ storyId: 'a', variantId: 'b:c' })
      expect(await rejected).toMatchObject({ code: 'RUNTIME_CHANGED' })
      done.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(fixture.fixture.request.mock.calls.filter(([command]) => command === 'state.patch')).toHaveLength(0)
      expect(fixture.live.count).toBe(2)
    }
    finally {
      done.resolve()
      await fixture.close()
    }
  })

  it('close rejects abandoned callbacks and observes late rejection without state write', async () => {
    const fixture = await commandFixture()
    const done = deferred<void>()
    const action = vi.fn(async (_params, context) => {
      context.currentVariant.state.count = 99
      await done.promise
    })
    const operation = fixture.actions.execute({ id: 'close', label: 'Close', clientAction: action }, {}, fixture.context)
    const rejected = operation.catch(error => error)
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
    fixture.actions.close()
    expect(await rejected).toMatchObject({ code: 'DISPOSED' })
    await expect(fixture.actions.execute({ id: 'closed', label: 'Closed', clientAction: vi.fn() }, {}, fixture.context)).rejects.toMatchObject({ code: 'DISPOSED' })
    done.reject(new Error('late callback failure'))
    await Promise.resolve()
    await Promise.resolve()
    expect(fixture.live.count).toBe(2)
    await fixture.close()
  })
})
