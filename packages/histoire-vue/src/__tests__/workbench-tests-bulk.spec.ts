import type { HistoireTestRunSummary } from '@histoire/protocol'
import { getHistoireTargetKey } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Real session fixture preserves opaque targets and lifecycle ownership. */
async function setup() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  return { fixture, session }
}

/** One server batch deliberately reuses test IDs across distinct target tuples. */
function batch() {
  return { ok: false, total: 2, passed: 1, failed: 1, skipped: 0, errors: ['failure'], tests: [
    { id: '0', name: 'first', fullName: 'first', storyId: 'a:b', variantId: 'c', state: 'passed' as const, errors: [] },
    { id: '0', name: 'second', fullName: 'second', storyId: 'a', variantId: 'b:c', state: 'failed' as const, errors: ['failure'] },
  ] }
}

describe('project bulk test execution', () => {
  it('uses one worker and publishes exact per-variant results and definitions', async () => {
    const { session } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const source = session.getSnapshot().source!
    const execution = { runId: 'current-publication', mode: 'server' as const, sourceId: source.sourceId, epoch: source.epoch, revision: source.revision }
    const gate = deferred<HistoireTestRunSummary>()
    const runProject = vi.fn((_signal: AbortSignal) => gate.promise)
    const model = createWorkbenchTestsModel(session, undefined, { runProject })
    try {
      const operation = model.runAll()
      expect(runProject).toHaveBeenCalledOnce()
      expect(model.rows.value.every(row => row.running)).toBe(true)
      await model.runAll()
      expect(runProject).toHaveBeenCalledOnce()
      gate.resolve({ ...batch(), execution })
      await operation
      const first = model.entries.value.get(getHistoireTargetKey({ storyId: 'a:b', variantId: 'c' }))!
      const second = model.entries.value.get(getHistoireTargetKey({ storyId: 'a', variantId: 'b:c' }))!
      const empty = model.entries.value.get(getHistoireTargetKey({ storyId: 'a:b', variantId: 'other' }))!
      expect(first.summary).toMatchObject({ total: 1, passed: 1, failed: 0 })
      expect(first.summary?.execution).toEqual({ ...execution, target: first.target })
      expect(first.collection?.definitions.map(test => test.name)).toEqual(['first'])
      expect(second.summary).toMatchObject({ total: 1, passed: 0, failed: 1 })
      expect(empty.summary).toMatchObject({ total: 0, passed: 0, failed: 0 })
      expect(model.summary.value).toMatchObject({ passed: 1, failed: 1, notCollected: 0 })
      expect(model.rows.value.every(row => !row.running)).toBe(true)
      expect(model.completed.value).toBe(3)
      expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('marks cancelled bulk targets outdated and ignores late predecessor results', async () => {
    const { session } = await setup()
    const gate = deferred<ReturnType<typeof batch>>()
    const runProject = vi.fn((_signal: AbortSignal) => gate.promise)
    const model = createWorkbenchTestsModel(session, undefined, { runProject })
    try {
      const operation = model.runAll()
      model.cancel()
      expect(runProject.mock.calls[0][0].aborted).toBe(true)
      gate.resolve(batch())
      await operation
      expect(model.summary.value).toMatchObject({ failed: 0, stale: 0 })
      expect(model.rows.value.every(row => row.summary === null && !row.running)).toBe(true)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('runs one affected story worker in Watch and projects both variants', async () => {
    const { session } = await setup()
    const runStory = vi.fn(async (_storyId: string, _signal: AbortSignal) => ({ ...batch(), ok: true, total: 1, passed: 1, failed: 0, errors: [], tests: batch().tests.slice(0, 1) }))
    const model = createWorkbenchTestsModel(session, undefined, { runStory })
    try {
      model.setWatch(true)
      model.invalidate('a:b')
      await vi.waitFor(() => expect(model.running.value).toBe(false))
      expect(runStory).toHaveBeenCalledOnce()
      expect(runStory.mock.calls[0][0]).toBe('a:b')
      expect(model.rows.value.filter(row => row.target.storyId === 'a:b').every(row => row.summary !== null)).toBe(true)
      expect(model.rows.value.find(row => row.target.storyId === 'a')?.summary).toBeNull()
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('retires project admission on direct source revision replacement', async () => {
    const { fixture, session } = await setup()
    const gate = deferred<ReturnType<typeof batch>>()
    const runProject = vi.fn((_signal: AbortSignal) => gate.promise)
    const model = createWorkbenchTestsModel(session, undefined, { runProject })
    try {
      const operation = model.runAll()
      fixture.descriptor.revision = 'replacement'
      fixture.emitCatalog()
      expect(runProject.mock.calls[0][0].aborted).toBe(true)
      gate.resolve(batch())
      await operation
      expect(model.summary.value).toMatchObject({ failed: 0, stale: 0 })
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('rejects foreign source provenance without reporting failed assertions', async () => {
    const { session } = await setup()
    const runProject = vi.fn(async (_signal: AbortSignal) => ({ ...batch(), execution: { runId: 'foreign', mode: 'server' as const, sourceId: 'other-book', epoch: 'epoch-1', revision: 'revision-1' } }))
    const model = createWorkbenchTestsModel(session, undefined, { runProject })
    try {
      await model.runAll()
      expect(model.summary.value).toMatchObject({ failed: 0, stale: 0, notCollected: 0 })
      expect(model.rows.value.every(row => row.stale)).toBe(true)
      expect(model.error.value).toBeNull()
    }
    finally {
      model.close()
      await session.dispose()
    }
  })
})
