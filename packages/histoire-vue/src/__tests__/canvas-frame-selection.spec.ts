import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { watchCanvasSelectedSession } from '../../../histoire-app/src/app/components/canvas/frame-selection.js'
import { createCanvasFrames } from '../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

let dispose: (() => Promise<void>) | undefined
afterEach(async () => {
  await dispose?.()
  dispose = undefined
})

/** Genuine sessions retain separate runtime owners while canonical session owns route state. */
async function selectionFixture() {
  const sources = [sourceFixture(), sourceFixture(), sourceFixture()]
  const sessions = sources.map(source => createHistoireSessionWithAdapters({ url: 'https://book.test/' }, source.adapters))
  await Promise.all(sessions.map(session => session.connect()))
  const [canonical, first, second] = sessions
  const targets = [{ storyId: 'a:b', variantId: 'c' }, { storyId: 'a:b', variantId: 'other' }]
  await canonical.selection.select(targets[0])
  await first.selection.select(targets[0])
  await second.selection.select(targets[1])
  await Promise.all([first.mount({} as HTMLElement, { surface: 'preview' }).ready, second.mount({} as HTMLElement, { surface: 'preview' }).ready])
  const snapshot = shallowRef(canonical.getSnapshot())
  const stopSnapshot = canonical.subscribe(value => snapshot.value = value)
  const registry = createCanvasFrames(createCanvasStore())
  for (const [index, target] of targets.entries()) {
    registry.registerFrame({ id: JSON.stringify([target.storyId, target.variantId]), ...target, rect: { x: 0, y: 0, width: 100, height: 100 }, session: sessions[index + 1], documentId: 'document-1', iframe: document.createElement('iframe') })
  }
  const unavailable = shallowRef(false)
  const publish = vi.fn()
  const scope = effectScope()
  scope.run(() => watchCanvasSelectedSession({ snapshot: () => snapshot.value, registry, unavailable: () => unavailable.value, publish }))
  dispose = async () => {
    scope.stop()
    stopSnapshot()
    await Promise.all(sessions.map(session => session.dispose()))
  }
  return { canonical, first, second, targets, registry, unavailable, publish, sources }
}

describe('canvas selected frame session', () => {
  it('follows canonical selection without disposing or retargeting admitted frames', async () => {
    const test = await selectionFixture()
    expect(test.publish).toHaveBeenLastCalledWith(test.first)
    await test.canonical.selection.select(test.targets[1])
    expect(test.publish).toHaveBeenLastCalledWith(test.second)
    test.sources[1].emitState()
    expect(test.publish).toHaveBeenLastCalledWith(test.second)
    await test.canonical.selection.select(test.targets[0])
    expect(test.publish).toHaveBeenLastCalledWith(test.first)
    expect(test.first.getSnapshot().selection).toEqual(test.targets[0])
    expect(test.second.getSnapshot().selection).toEqual(test.targets[1])
    expect(test.sources.slice(1).every(source => source.surfaceClose.mock.calls.length === 0)).toBe(true)
  })

  it('rejects loading, replaced documents and retired registrations', async () => {
    const test = await selectionFixture()
    test.sources[1].reload()
    expect(test.publish).toHaveBeenLastCalledWith(undefined)
    await test.canonical.selection.select(test.targets[1])
    test.sources[1].ready()
    expect(test.publish).toHaveBeenLastCalledWith(test.second)
    const entry = test.registry.getFrame(JSON.stringify(['a:b', 'other']))!
    entry.documentId = 'replacement'
    expect(test.publish).toHaveBeenLastCalledWith(undefined)
    entry.documentId = 'document-1'
    expect(test.publish).toHaveBeenLastCalledWith(test.second)
    test.registry.frames.delete(entry.id)
    test.sources[2].emitState()
    expect(test.publish).toHaveBeenLastCalledWith(undefined)
  })

  it('releases inspector ownership for Matrix and changed source generation', async () => {
    const test = await selectionFixture()
    test.unavailable.value = true
    expect(test.publish).toHaveBeenLastCalledWith(undefined)
    test.unavailable.value = false
    expect(test.publish).toHaveBeenLastCalledWith(test.first)
    test.sources[0].descriptor.epoch = 'replacement-epoch'
    test.sources[0].emitCatalog()
    test.sources[1].emitState()
    expect(test.publish).toHaveBeenLastCalledWith(undefined)
  })
})
