import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireTestsModel } from '../tests/model.js'

/** Real session fixtures retain exact target IDs and source lifecycle. */
async function setup() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  return { fixture, session }
}

/** Minimal assertion summary, shared by project tests scenarios. */
function summary(failed = false) {
  return { ok: !failed, total: 1, passed: failed ? 0 : 1, failed: failed ? 1 : 0, skipped: 0, errors: [], tests: [{ id: 'assert', name: 'assert', fullName: 'assert', state: failed ? 'failed' as const : 'passed' as const, errors: [] }] }
}

/** Attribute one bulk server result to its exact catalog target. */
function storySummary(storyId: string, variantId: string) {
  return { ...summary(), tests: [{ ...summary().tests[0], storyId, variantId }] }
}

describe('project tests model', () => {
  it('runs every exact collected variant serially once without changing selection', async () => {
    const { session } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const gate = deferred<any>()
    const run = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(summary(true))
    const model = createWorkbenchTestsModel(session, undefined, { run })
    const first = model.runAll()
    expect(run).toHaveBeenCalledOnce()
    await model.runAll()
    expect(run).toHaveBeenCalledOnce()
    gate.resolve(summary())
    await first
    expect(run.mock.calls.map(([target]) => target)).toEqual([{ storyId: 'a:b', variantId: 'c' }, { storyId: 'a:b', variantId: 'other' }, { storyId: 'a', variantId: 'b:c' }])
    expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
    expect(model.summary.value).toMatchObject({ passed: 1, failed: 2, skipped: 0, stale: 0 })
    model.close()
    await session.dispose()
  })

  it('shares selected preview results and separates skipped definitions, stale and collection errors', async () => {
    const { fixture, session } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    fixture.descriptor.catalog.diagnostics.push({ code: 'COLLECT_ERROR', message: 'Could not collect', severity: 'error', storyId: 'broken' })
    fixture.emitCatalog()
    const selected = createHistoireTestsModel(session)
    const model = createWorkbenchTestsModel(session, selected)
    selected.state.value = { status: 'idle', collection: { definitions: [{ id: 'skip', name: 'skip', fullName: 'skip', mode: 'skip' }] }, summary: null, error: null }
    expect(model.summary.value).toMatchObject({ skipped: 1, notCollected: 1 })
    selected.state.value = { ...selected.state.value, status: 'completed', summary: summary(true) }
    expect(model.rows.value.filter(row => row.failed)).toHaveLength(2)
    model.invalidate('a:b')
    expect(model.summary.value.stale).toBe(1)
    expect(model.rows.value.find(row => row.target?.storyId === 'a:b')?.stale).toBe(true)
    selected.state.value = { ...selected.state.value, status: 'idle', collection: { definitions: [] }, summary: null }
    expect(model.summary.value.stale).toBe(0)
    expect(model.visibleRows.value.some(row => row.target.storyId === 'a:b')).toBe(false)
    expect(model.rows.value.find(row => row.target.storyId === 'a:b' && row.target.variantId === 'c')?.summary?.failed).toBe(1)
    model.close()
    selected.controller.close()
    await session.dispose()
  })

  it('watch reruns only changed story, persists setting, ignores completion after cancellation', async () => {
    const { session } = await setup()
    const gate = deferred<any>()
    const run = vi.fn().mockResolvedValue(summary())
    const storage = { getItem: () => '{"watchTests":false,"other":1}', setItem: vi.fn() }
    const model = createWorkbenchTestsModel(session, undefined, { run, storage })
    model.setWatch(true)
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({ watchTests: true, other: 1 })
    model.invalidate('a')
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
    expect(run.mock.calls[0][0]).toEqual({ storyId: 'a', variantId: 'b:c' })
    model.setWatch(false)
    model.invalidate('a:b')
    expect(run).toHaveBeenCalledOnce()
    run.mockReturnValueOnce(gate.promise)
    const operation = model.runAll()
    const signal = run.mock.calls[1][1] as AbortSignal
    model.cancel()
    expect(signal.aborted).toBe(true)
    gate.resolve(summary(true))
    await operation
    expect(model.summary.value.failed).toBe(0)
    expect(model.rows.value.some(row => row.stale)).toBe(true)
    model.close()
    await session.dispose()
  })

  it('never attributes selected model cancellation results to replacement variant', async () => {
    const { session } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const selected = createHistoireTestsModel(session)
    const model = createWorkbenchTestsModel(session, selected)
    selected.state.value = { status: 'completed', collection: null, summary: summary(true), error: null }
    await session.selection.select({ storyId: 'a', variantId: 'b:c' })
    expect(model.rows.value.find(row => row.target.storyId === 'a')?.summary).toBeNull()
    expect(model.rows.value.find(row => row.target.storyId === 'a:b' && row.target.variantId === 'c')?.summary?.failed).toBe(1)
    model.close()
    selected.controller.close()
    await session.dispose()
  })

  it('disconnect retires running result authority before late completion', async () => {
    const { fixture, session } = await setup()
    const gate = deferred<any>()
    const run = vi.fn().mockReturnValue(gate.promise)
    const model = createWorkbenchTestsModel(session, undefined, { run })
    const operation = model.runAll()
    fixture.emitDisconnect()
    expect(model.running.value).toBe(false)
    expect(run.mock.calls[0][1].aborted).toBe(true)
    gate.resolve(summary(true))
    await operation
    expect(model.summary.value.failed).toBe(0)
    model.close()
    await session.dispose()
  })

  it('shares watch preference with Settings screen in both directions', async () => {
    const { session } = await setup()
    const state = reactive({ watchTests: true })
    const update = vi.fn((patch: { watchTests: boolean }) => Object.assign(state, patch))
    const storage = { getItem: () => '{}', setItem: vi.fn() }
    const model = createWorkbenchTestsModel(session, undefined, { settings: { state, update }, storage })
    expect(model.watchTests.value).toBe(true)
    model.setWatch(false)
    expect(update).toHaveBeenCalledWith({ watchTests: false })
    expect(state.watchTests).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    state.watchTests = true
    expect(model.watchTests.value).toBe(true)
    model.close()
    await session.dispose()
  })

  it('projects selected preview run lifecycle into exact project row', async () => {
    const { session } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const gate = deferred<ReturnType<typeof summary>>()
    vi.spyOn(session.tests, 'run').mockReturnValue(gate.promise)
    const selected = createHistoireTestsModel(session)
    const model = createWorkbenchTestsModel(session, selected)
    try {
      const operation = selected.controller.run('server')
      expect(model.rows.value.find(row => row.target.storyId === 'a:b' && row.target.variantId === 'c')?.running).toBe(true)
      await session.selection.select({ storyId: 'a', variantId: 'b:c' })
      expect(model.rows.value.find(row => row.target.storyId === 'a:b' && row.target.variantId === 'c')).toMatchObject({ running: false, stale: true })
      gate.resolve(summary())
      await operation
      expect(model.rows.value.find(row => row.target.storyId === 'a')?.summary).toBeNull()
    }
    finally {
      model.close()
      selected.controller.close()
      await session.dispose()
    }
  })

  it('replaces older project cache with newer explicit selected result synchronously', async () => {
    const { session } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const older = summary(true)
    const runProject = vi.fn(async () => ({ ...older, tests: older.tests.map(test => ({ ...test, storyId: 'a:b', variantId: 'c' })) }))
    const newer = summary()
    vi.spyOn(session.tests, 'run').mockResolvedValue(newer)
    const selected = createHistoireTestsModel(session)
    const model = createWorkbenchTestsModel(session, selected, { runProject })
    try {
      await model.runAll()
      expect(model.rows.value.find(row => row.target.storyId === 'a:b' && row.target.variantId === 'c')?.summary?.failed).toBe(1)
      await selected.controller.run('server')
      expect(model.rows.value.find(row => row.target.storyId === 'a:b' && row.target.variantId === 'c')?.summary).toBe(newer)
      expect(model.summary.value).toMatchObject({ passed: 1, failed: 0 })
    }
    finally {
      model.close()
      selected.controller.close()
      await session.dispose()
    }
  })

  it('invalidates completed cache and reruns Watch after catalog-only executable provenance changes', async () => {
    const { fixture, session } = await setup()
    fixture.descriptor.catalog.stories = [{ ...fixture.descriptor.catalog.stories[0], runtimeRevision: 'a'.repeat(64), variants: [fixture.descriptor.catalog.stories[0].variants[0]] }]
    fixture.emitCatalog()
    const rerun = deferred<ReturnType<typeof storySummary>>()
    const runProject = vi.fn(async () => storySummary('a:b', 'c'))
    const runStory = vi.fn(() => rerun.promise)
    const model = createWorkbenchTestsModel(session, undefined, { runProject, runStory })
    try {
      await model.runAll()
      model.setWatch(true)
      fixture.descriptor.revision = 'revision-2'
      fixture.descriptor.catalog.stories[0].runtimeRevision = 'b'.repeat(64)
      fixture.emitCatalog()
      expect(model.rows.value[0]).toMatchObject({ stale: true, summary: { passed: 1 } })
      await vi.waitFor(() => expect(runStory).toHaveBeenCalledWith('a:b', expect.any(AbortSignal)))
      expect(runStory).toHaveBeenCalledOnce()
      rerun.resolve(storySummary('a:b', 'c'))
      await vi.waitFor(() => expect(model.running.value).toBe(false))
      expect(model.rows.value[0].stale).toBe(false)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('retains completed cache across catalog revisions with unchanged executable provenance', async () => {
    const { fixture, session } = await setup()
    fixture.descriptor.catalog.stories = [{ ...fixture.descriptor.catalog.stories[0], runtimeRevision: 'a'.repeat(64), variants: [fixture.descriptor.catalog.stories[0].variants[0]] }]
    fixture.emitCatalog()
    const runProject = vi.fn(async () => storySummary('a:b', 'c'))
    const runStory = vi.fn(async () => storySummary('a:b', 'c'))
    const model = createWorkbenchTestsModel(session, undefined, { runProject, runStory })
    try {
      await model.runAll()
      model.setWatch(true)
      fixture.descriptor.revision = 'revision-2'
      fixture.emitCatalog()
      await Promise.resolve()
      expect(model.rows.value[0]).toMatchObject({ stale: false, summary: { passed: 1 } })
      expect(runStory).not.toHaveBeenCalled()
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('treats a catalog revision without executable provenance as stale', async () => {
    const { fixture, session } = await setup()
    const rerun = deferred<ReturnType<typeof storySummary>>()
    const runProject = vi.fn(async () => storySummary('a:b', 'c'))
    const runStory = vi.fn(() => rerun.promise)
    const model = createWorkbenchTestsModel(session, undefined, { runProject, runStory })
    try {
      await model.runAll()
      model.setWatch(true)
      fixture.descriptor.revision = 'revision-2'
      fixture.emitCatalog()
      expect(model.rows.value[0].stale).toBe(true)
      await vi.waitFor(() => expect(runStory).toHaveBeenCalledOnce())
      rerun.resolve(storySummary('a:b', 'c'))
      await vi.waitFor(() => expect(model.running.value).toBe(false))
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('does not treat selection publication as an executable catalog change', async () => {
    const { session } = await setup()
    const runProject = vi.fn(async () => storySummary('a:b', 'c'))
    const runStory = vi.fn(async () => storySummary('a:b', 'c'))
    const model = createWorkbenchTestsModel(session, undefined, { runProject, runStory })
    try {
      await model.runAll()
      model.setWatch(true)
      await session.selection.select({ storyId: 'a', variantId: 'b:c' })
      expect(model.rows.value.find(row => row.target.storyId === 'a:b')?.stale).toBe(false)
      expect(runStory).not.toHaveBeenCalled()
    }
    finally {
      model.close()
      await session.dispose()
    }
  })
})
