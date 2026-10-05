import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { createHistoireSessionWithAdapters, waitForHistoireSelection } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

/** Injected surface adapter never reads this browser-only mounting argument. */
const container = {} as HTMLElement
const initial = { storyId: 'a:b', variantId: 'c' }
const next = { storyId: 'a:b', variantId: 'other' }

describe('same-target selection readiness', () => {
  it('shares pending ACK and composition barrier even after early runtime readiness', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    const acknowledgment = deferred<void>()
    const delegate = fixture.request.getMockImplementation()!
    try {
      await session.connect()
      await session.selection.select(initial)
      await session.mount(container, { surface: 'preview' }).ready
      fixture.request.mockImplementation(async (command, payload) => {
        if (command === 'selection.select') await acknowledgment.promise
        return delegate(command, payload)
      })
      const first = session.selection.select(next)
      const duplicate = session.selection.select(next)
      await Promise.resolve()
      // Ready publications can precede request completion. Duplicate caller still
      // owns original ACK/error, rather than replacing composition barrier.
      fixture.ready()
      const lateDuplicate = session.selection.select(next)
      const barrier = waitForHistoireSelection(session)
      const settled: number[] = []
      const operations = [first, duplicate, lateDuplicate, barrier]
      operations.forEach((operation, index) => void operation.then(() => settled.push(index), () => settled.push(index)))
      await Promise.resolve()
      await Promise.resolve()
      expect(settled).toEqual([])
      expect(fixture.request.mock.calls.filter(([command]) => command === 'selection.select')).toHaveLength(1)
      acknowledgment.resolve()
      await Promise.all(operations)
      expect(session.getSnapshot().runtime.status).toBe('ready')
    }
    finally {
      acknowledgment.resolve()
      await session.dispose()
    }
  })

  it.each(['initial mount', 'reload'] as const)('awaits actual same-target %s readiness without selection replay', async (mode) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    const ready = deferred<HistoireRuntimeSnapshot>()
    try {
      await session.connect()
      await session.selection.select(initial)
      if (mode === 'initial mount') {
        const mount = fixture.adapters.mount!
        fixture.adapters.mount = capture => ({ ...mount(capture), ready: ready.promise })
      }
      const primary = session.mount(container, { surface: 'preview' })
      if (mode === 'reload') {
        await primary.ready
        fixture.reload()
      }
      const first = session.selection.select(initial)
      const duplicate = session.selection.select(initial)
      let settled = false
      void waitForHistoireSelection(session).then(() => {
        settled = true
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(settled).toBe(false)
      expect(session.getSnapshot().runtime.status).toBe('mounting')
      ready.resolve(fixture.runtime())
      if (mode === 'reload') fixture.ready()
      await Promise.all([primary.ready, first, duplicate])
      expect(session.getSnapshot().runtime.status).toBe('ready')
      expect(fixture.request.mock.calls.some(([command]) => command === 'selection.select')).toBe(false)
    }
    finally {
      ready.resolve(fixture.runtime())
      await session.dispose()
    }
  })

  it('keeps ready, metadata-only and docs-only selection as no-op', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    try {
      await session.connect()
      await session.selection.select(initial)
      await session.selection.select(initial)
      const primary = session.mount(container, { surface: 'preview' })
      await primary.ready
      const before = fixture.request.mock.calls.length
      await session.selection.select(initial)
      expect(fixture.request.mock.calls).toHaveLength(before)
      await primary.unmount()
      await session.selection.select({ storyId: 'docs' })
      await session.selection.select({ storyId: 'docs' })
      expect(session.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null })
      expect(fixture.request.mock.calls).toHaveLength(before)
    }
    finally { await session.dispose() }
  })

  it.each(['failed', 'stale'] as const)('rejects same-target %s runtime without an automatic execution retry', async (status) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    try {
      await session.connect()
      await session.selection.select(initial)
      await session.mount(container, { surface: 'preview' }).ready
      for (const listener of fixture.frameListeners) listener({ type: 'runtime', ...fixture.owner(), runtime: { ...fixture.runtime(), status } })
      const before = fixture.request.mock.calls.length
      await expect(session.selection.select(initial)).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
      expect(session.getSnapshot().runtime.status).toBe(status)
      expect(fixture.request.mock.calls).toHaveLength(before)
      await waitForHistoireSelection(session)
    }
    finally { await session.dispose() }
  })

  it('does not acknowledge a quarantined primary after unconfirmed teardown', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    try {
      await session.connect()
      await session.selection.select(initial)
      const primary = session.mount(container, { surface: 'preview' })
      await primary.ready
      fixture.surfaceClose.mockRejectedValue(new Error('cleanup unconfirmed'))
      await expect(primary.unmount()).rejects.toThrow('cleanup unconfirmed')
      await expect(session.selection.select(initial)).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
      expect(session.getSnapshot().runtime.status).toBe('failed')
    }
    finally { await session.dispose().catch(() => {}) }
  })

  it.each(['failed', 'stale', 'absent'] as const)('retires matching readiness waiter promptly when runtime becomes %s', async (status) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    try {
      await session.connect()
      await session.selection.select(initial)
      await session.mount(container, { surface: 'preview' }).ready
      fixture.reload()
      const operation = session.selection.select(initial)
      const rejected = expect(operation).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY' })
      await Promise.resolve()
      for (const listener of fixture.frameListeners) listener({ type: 'runtime', ...fixture.owner(), runtime: { ...fixture.runtime(), status } })
      await rejected
    }
    finally { await session.dispose() }
  })

  it('reserves original ACK before reentrant matching snapshot observer', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    const acknowledgment = deferred<void>()
    const delegate = fixture.request.getMockImplementation()!
    let duplicate: Promise<void> | undefined
    try {
      await session.connect()
      await session.selection.select(initial)
      await session.mount(container, { surface: 'preview' }).ready
      fixture.request.mockImplementation(async (command, payload) => {
        if (command === 'selection.select') await acknowledgment.promise
        return delegate(command, payload)
      })
      const off = session.subscribe((snapshot) => {
        if (!duplicate && snapshot.selection?.variantId === 'other') duplicate = session.selection.select(next)
      })
      const original = session.selection.select(next)
      off()
      let completed = false
      void duplicate!.then(() => {
        completed = true
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(completed).toBe(false)
      acknowledgment.resolve()
      await Promise.all([original, duplicate])
      expect(fixture.request.mock.calls.filter(([command]) => command === 'selection.select')).toHaveLength(1)
    }
    finally {
      acknowledgment.resolve()
      await session.dispose()
    }
  })

  it.each(['navigation', 'publication', 'dispose'] as const)('rejects intent superseded by reentrant %s before transport admission', async (action) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    let successor: Promise<void> | undefined
    try {
      await session.connect()
      await session.selection.select(initial)
      await session.mount(container, { surface: 'preview' }).ready
      const off = session.subscribe((snapshot) => {
        if (snapshot.selection?.variantId !== 'other') return
        off()
        if (action === 'navigation') {
          successor = session.selection.select(initial)
        }
        else if (action === 'dispose') {
          successor = session.dispose()
        }
        else {
          fixture.descriptor.revision = 'revision-2'
          fixture.emitCatalog()
        }
      })
      const code = action === 'dispose' ? 'DISPOSED' : action === 'publication' ? 'STALE_REVISION' : 'RUNTIME_CHANGED'
      await expect(session.selection.select(next)).rejects.toMatchObject({ code })
      await successor
      expect(fixture.request.mock.calls.some(([command, payload]) => command === 'selection.select' && payload.variantId === 'other')).toBe(false)
    }
    finally { await session.dispose() }
  })

  it.each(['navigation', 'unmount', 'dispose', 'publication'] as const)('rejects every matching pending caller on %s', async (action) => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    const acknowledgment = deferred<void>()
    const delegate = fixture.request.getMockImplementation()!
    try {
      await session.connect()
      await session.selection.select(initial)
      const primary = session.mount(container, { surface: 'preview' })
      await primary.ready
      fixture.request.mockImplementation(async (command, payload) => {
        if (command === 'selection.select' && payload.variantId === 'other') await acknowledgment.promise
        return delegate(command, payload)
      })
      const first = session.selection.select(next)
      const duplicate = session.selection.select(next)
      const code = action === 'dispose' ? 'DISPOSED' : action === 'publication' ? 'STALE_REVISION' : 'RUNTIME_CHANGED'
      const results = [first, duplicate].map(operation => expect(operation).rejects.toMatchObject({ code }))
      await Promise.resolve()
      if (action === 'navigation') {
        await session.selection.select(initial)
      }
      else if (action === 'unmount') {
        await primary.unmount()
      }
      else if (action === 'dispose') {
        await session.dispose()
      }
      else {
        fixture.descriptor.revision = 'revision-2'
        fixture.emitCatalog()
      }
      await Promise.all(results)
      expect(fixture.request.mock.calls.filter(([command, payload]) => command === 'selection.select' && payload.variantId === 'other')).toHaveLength(1)
    }
    finally {
      acknowledgment.resolve()
      await session.dispose()
    }
  })
})
