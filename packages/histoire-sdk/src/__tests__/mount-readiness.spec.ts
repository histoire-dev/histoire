import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import { expect, it } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

/** Injected transports never dereference this mounting container. */
const container = {} as HTMLElement

it.each([null, 'docs'])('settles captured data-only primary readiness while later selection awaits runtime (%s)', async (initialStory) => {
  const fixture = sourceFixture()
  const ready = deferred<void>()
  const selected = deferred<HistoireRuntimeSnapshot>()
  const originalMount = fixture.adapters.mount!
  fixture.adapters.mount = (capture) => {
    const transport = originalMount(capture)
    transport.ready = ready.promise
    return transport
  }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  let selecting: Promise<void> | undefined
  try {
    await session.connect()
    if (initialStory) await session.selection.select({ storyId: initialStory })
    const primary = session.mount(container, { surface: 'preview' })
    fixture.request.mockImplementationOnce(() => selected.promise)
    selecting = session.selection.select({ storyId: 'a:b', variantId: 'c' })
    void selecting.catch(() => {})
    expect(session.getSnapshot().runtime.status).toBe('mounting')
    // Empty/doc-only mount acknowledges view, while separate selection owns actual runtime readiness.
    ready.resolve()
    await expect(primary.ready).resolves.toBeUndefined()
    expect(() => session.createHiddenPreview()).toThrow(expect.objectContaining({ code: 'RUNTIME_IN_USE' }))
    await expect(session.state.get()).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
    selected.resolve(fixture.runtime())
    await selecting
    expect(session.getSnapshot().runtime.status).toBe('ready')
  }
  finally {
    selected.resolve(fixture.runtime())
    await selecting?.catch(() => {})
    await session.dispose()
  }
})

it('rejects captured selected mount overtaken by another selected target', async () => {
  const fixture = sourceFixture()
  const ready = deferred<void>()
  const originalMount = fixture.adapters.mount!
  fixture.adapters.mount = capture => ({ ...originalMount(capture), ready: ready.promise })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  try {
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount(container, { surface: 'preview' })
    await session.selection.select({ storyId: 'a', variantId: 'b:c' })
    ready.resolve()
    await expect(primary.ready).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
  }
  finally { await session.dispose() }
})

it('requires actual runtime acknowledgement for captured selected mount', async () => {
  const fixture = sourceFixture()
  const originalMount = fixture.adapters.mount!
  fixture.adapters.mount = capture => ({ ...originalMount(capture), ready: Promise.resolve() })
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  try {
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await expect(session.mount(container, { surface: 'grid' }).ready).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
  }
  finally { await session.dispose() }
})
