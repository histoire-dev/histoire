import type { CanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CanvasFrame from '../../../histoire-app/src/app/components/canvas/CanvasFrame.vue'
import CanvasReplicaPreview from '../../../histoire-app/src/app/components/canvas/CanvasReplicaPreview.vue'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { canvasLifetimeFixture } from './fixtures/canvas-lifetime.js'

const replica = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../../../histoire-app/src/app/components/canvas/frame-replica.js', () => ({ createCanvasReplicaSession: replica.create }))
afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Enter Single after existing fixture establishes canonical source and geometry. */
async function singleFixture() {
  const fixture = await canvasLifetimeFixture(replica.create)
  fixture.arrange.value = 'single'
  await flushPromises()
  const owner = fixture.children.at(-1)!
  const registry = (fixture.viewport.vm as unknown as { registry: CanvasFrames }).registry
  /** Navigation goes through canonical selection while replica owns readiness. */
  async function select(variantId: string) {
    await fixture.canonical.selection.select({ storyId: 'a:b', variantId })
    await flushPromises()
  }
  return { ...fixture, owner, registry, select }
}

describe('single retained variant selection', () => {
  it('replaces logical registration and keeps each background without reseeding a retained actor', async () => {
    const test = await singleFixture()
    const before = [...test.registry.frames.values()][0]
    await test.owner.session.state.patch({ label: 'Edited A' })
    test.canvas.setFrameBackground(before.id, '#123456', false, 'light')
    await flushPromises()
    await test.select('other')
    const other = [...test.registry.frames.values()][0]
    expect(other).not.toBe(before)
    expect(test.registry.frames.size).toBe(1)
    expect(other.session).toBe(test.owner.session)
    expect(test.owner.session.getSnapshot().settings.backgroundColor).not.toBe('#123456')
    test.owner.source.request.mockClear()
    await test.select('c')
    const current = [...test.registry.frames.values()][0]
    expect(current).not.toBe(before)
    expect(current.session).toBe(test.owner.session)
    expect(test.owner.session.getSnapshot().settings.backgroundColor).toBe('#123456')
    expect(test.owner.source.request.mock.calls.some(([command]) => command === 'state.patch')).toBe(false)
  })

  it('ignores superseded selection failure and retains one mount during rapid A/B/A', async () => {
    const test = await singleFixture()
    const pending = deferred<any>()
    const dispatch = test.owner.source.request.getMockImplementation()!
    test.owner.source.request.mockImplementation((command, payload) => command === 'selection.select' && payload.variantId === 'other'
      ? pending.promise
      : dispatch(command, payload))
    await test.select('other')
    expect([...test.registry.frames.values()][0].session).toBeUndefined()
    await test.select('c')
    pending.reject(new Error('Obsolete selection'))
    await flushPromises()
    expect(test.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(test.children.at(-1)).toBe(test.owner)
    expect(test.owner.source.adapters.mount).toHaveBeenCalledOnce()
    expect([...test.registry.frames.values()][0].session).toBe(test.owner.session)
  })

  it('takes newest target while initial connection is pending', async () => {
    const test = await canvasLifetimeFixture(replica.create)
    const connect = deferred<void>()
    test.prepareChild.mockImplementationOnce((child) => {
      const original = child.session.connect.bind(child.session)
      vi.spyOn(child.session, 'connect').mockImplementation(async () => {
        await connect.promise
        await original()
      })
    })
    test.arrange.value = 'single'
    await flushPromises()
    const owner = test.children.at(-1)!
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    connect.resolve()
    await flushPromises()
    expect(test.children.at(-1)).toBe(owner)
    expect(owner.session.getSnapshot().selection?.variantId).toBe('other')
    expect(owner.source.adapters.mount).toHaveBeenCalledOnce()
    expect(test.wrapper.getComponent(CanvasFrame).props('frame').variantId).toBe('other')
  })

  it('forwards selection while initial mount acknowledgement is pending', async () => {
    const test = await canvasLifetimeFixture(replica.create)
    const initialReady = deferred<any>()
    test.prepareChild.mockImplementationOnce((child) => {
      const mount = child.source.adapters.mount as ReturnType<typeof vi.fn>
      const original = mount.getMockImplementation()!
      mount.mockImplementation(context => ({ ...original(context), ready: initialReady.promise }))
    })
    test.arrange.value = 'single'
    await flushPromises()
    const owner = test.children.at(-1)!
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    initialReady.reject(new Error('Retired initial mount'))
    await flushPromises()
    expect(owner.session.getSnapshot().selection?.variantId).toBe('other')
    expect(test.children.at(-1)).toBe(owner)
    expect(test.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([owner.session])
  })

  it('does not publish stale first-visit restoration after a newer selection', async () => {
    const test = await canvasLifetimeFixture(replica.create)
    const gridOwner = test.children.find(child => child.session.getSnapshot().selection?.variantId === 'other')!
    await gridOwner.session.state.patch({ label: 'Edited in Grid' })
    test.arrange.value = 'single'
    await flushPromises()
    const owner = test.children.at(-1)!
    const restored = deferred<any>()
    const dispatch = owner.source.request.getMockImplementation()!
    owner.source.request.mockImplementation((command, payload) => command === 'state.patch'
      ? restored.promise
      : dispatch(command, payload))
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'other' })
    await flushPromises()
    expect(owner.source.request).toHaveBeenCalledWith('state.patch', expect.objectContaining({ label: 'Edited in Grid' }), expect.anything())
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([undefined])
    await test.canonical.selection.select({ storyId: 'a:b', variantId: 'c' })
    await flushPromises()
    restored.reject(new Error('Retired restoration'))
    await flushPromises()
    expect(owner.session.getSnapshot().selection?.variantId).toBe('c')
    expect(test.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(test.viewport.emitted('selectedSession')?.at(-1)).toEqual([owner.session])
  })

  it('retires session on Retry and cross-story navigation, restoring cached state on return', async () => {
    const test = await singleFixture()
    await test.owner.session.state.patch({ label: 'Keep across stories' })
    await (test.wrapper.getComponent(CanvasReplicaPreview).vm as unknown as { retry: () => Promise<void> }).retry()
    await flushPromises()
    const retried = test.children.at(-1)!
    expect(retried).not.toBe(test.owner)
    expect(test.owner.source.surfaceClose).toHaveBeenCalledOnce()
    await test.canonical.selection.select({ storyId: 'a', variantId: 'b:c' })
    await flushPromises()
    expect(retried.source.surfaceClose).toHaveBeenCalledOnce()
    await test.select('c')
    expect(test.children.at(-1)!.session.getSnapshot().state?.value).toMatchObject({ label: 'Keep across stories' })
  })

  it('settles direct Single startup when unmounted during retained-state restoration', async () => {
    const test = await singleFixture()
    await test.owner.session.state.patch({ label: 'Restore before ready' })
    await flushPromises()
    const restoration = deferred<any>()
    test.prepareChild.mockImplementationOnce((child) => {
      const dispatch = child.source.request.getMockImplementation()!
      child.source.request.mockImplementation((command, payload) => command === 'state.patch'
        ? restoration.promise.then(() => dispatch(command, payload))
        : dispatch(command, payload))
    })

    const preview = test.wrapper.getComponent(CanvasReplicaPreview)
    const retry = (preview.vm as unknown as { retry: () => Promise<void> }).retry()
    await flushPromises()
    const replacement = test.children.at(-1)!
    expect(replacement.source.request).toHaveBeenCalledWith('state.patch', expect.objectContaining({ label: 'Restore before ready' }), expect.anything())

    test.wrapper.unmount()
    await expect(retry).resolves.toBeUndefined()
    expect(replacement.session.getSnapshot().status).toBe('disposed')
    expect(replacement.source.surfaceClose).toHaveBeenCalledOnce()
    restoration.resolve()
    await flushPromises()
  })
})
