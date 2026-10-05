import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireTestsModel } from '../tests/model.js'

/** Real connected source with deterministic executable provenance. */
async function setup() {
  const fixture = sourceFixture()
  for (const story of fixture.descriptor.catalog.stories) story.runtimeRevision = 'a'.repeat(64)
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  /** Full collection explicitly acknowledges every empty variant. */
  function collection(tested = true, storyId?: string): HistoireProjectTestCollectionResult {
    const source = session.getSnapshot().source!
    return { execution: { runId: 'discovery', mode: 'server', sourceId: source.sourceId, epoch: source.epoch, revision: source.revision }, variants: fixture.descriptor.catalog.stories.filter(story => !story.docsOnly && (!storyId || story.id === storyId)).flatMap(story => story.variants.map(variant => ({ target: { storyId: story.id, variantId: variant.id }, collection: { definitions: tested && variant.id === 'c' ? [{ id: '0', name: 'test', fullName: 'test' }] : [] } }))) }
  }
  return { fixture, session, collection }
}

describe('project test discovery', () => {
  it('discovers once before first run without selecting or fabricating assertion results', async () => {
    const { fixture, session, collection } = await setup()
    const collectProject = vi.fn(async () => collection())
    const model = createWorkbenchTestsModel(session, undefined, { collectProject })
    try {
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      expect(collectProject).toHaveBeenCalledOnce()
      expect(model.visibleRows.value.map(row => row.target)).toEqual([{ storyId: 'a:b', variantId: 'c' }])
      expect(model.rows.value).toHaveLength(3)
      expect(model.summary.value).toMatchObject({ passed: 0, failed: 0, idle: 1, duration: 0 })
      expect(model.visibleRows.value[0].summary).toBeNull()
      expect(session.getSnapshot().selection).toBeNull()
      fixture.descriptor.revision = 'metadata-only'
      fixture.emitCatalog()
      await Promise.resolve()
      expect(collectProject).toHaveBeenCalledOnce()
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('discovers added and removed tests after HMR with Watch off', async () => {
    const { fixture, session, collection } = await setup()
    let tested = false
    const collectStory = vi.fn(async (id: string) => collection(tested, id))
    const model = createWorkbenchTestsModel(session, undefined, { collectProject: async () => collection(false), collectStory })
    try {
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      expect(model.visibleRows.value).toHaveLength(0)
      tested = true
      model.invalidate('a:b')
      await vi.waitFor(() => expect(model.visibleRows.value).toHaveLength(1))
      tested = false
      fixture.descriptor.revision = 'removed-test'
      fixture.descriptor.catalog.stories[0].runtimeRevision = 'b'.repeat(64)
      fixture.emitCatalog()
      await vi.waitFor(() => expect(model.visibleRows.value).toHaveLength(0))
      expect(collectStory).toHaveBeenCalledTimes(2)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('ignores discovery overtaken by selected preview collection', async () => {
    const { session, collection } = await setup()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const gate = deferred<HistoireProjectTestCollectionResult>()
    const selected = createHistoireTestsModel(session)
    const model = createWorkbenchTestsModel(session, selected, { collectProject: () => gate.promise })
    try {
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('collecting'))
      selected.state.value = { status: 'idle', collection: { definitions: [] }, summary: null, error: null }
      gate.resolve(collection())
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      expect(model.visibleRows.value).toHaveLength(0)
    }
    finally {
      model.close()
      selected.controller.close()
      await session.dispose()
    }
  })

  it('keeps discovery failures actionable and supports explicit retry', async () => {
    const { session, collection } = await setup()
    const collectProject = vi.fn().mockRejectedValueOnce(new Error('Missing browser')).mockResolvedValue(collection(false))
    const model = createWorkbenchTestsModel(session, undefined, { collectProject })
    try {
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('error'))
      expect(model.discoveryError.value).toMatchObject({ message: 'Missing browser' })
      model.retryCollection()
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      expect(model.discoveryError.value).toBeNull()
      expect(collectProject).toHaveBeenCalledTimes(2)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('preempts discovery for Run all while retaining empty execution targets', async () => {
    const { session, collection } = await setup()
    const gate = deferred<HistoireProjectTestCollectionResult>()
    const collectProject = vi.fn((_signal: AbortSignal) => gate.promise)
    const run = vi.fn(async () => ({ ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] }))
    const model = createWorkbenchTestsModel(session, undefined, { collectProject, run })
    try {
      await vi.waitFor(() => expect(collectProject).toHaveBeenCalledOnce())
      await model.runAll()
      expect(collectProject.mock.calls[0][0].aborted).toBe(true)
      expect(run).toHaveBeenCalledTimes(3)
      gate.resolve(collection())
      await Promise.resolve()
      expect(model.visibleRows.value).toHaveLength(0)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('pauses discovery for concurrent captures and resumes only after final owner releases', async () => {
    const { session, collection } = await setup()
    const gate = deferred<HistoireProjectTestCollectionResult>()
    const collectProject = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async () => collection(false))
    const model = createWorkbenchTestsModel(session, undefined, { collectProject })
    try {
      await vi.waitFor(() => expect(collectProject).toHaveBeenCalledOnce())
      const first = model.suspendDiscovery()
      const second = model.suspendDiscovery()
      expect(collectProject.mock.calls[0][0].aborted).toBe(true)
      model.invalidate('a:b')
      model.retryCollection()
      gate.resolve(collection())
      await Promise.resolve()
      expect(model.visibleRows.value).toHaveLength(0)
      first()
      first()
      await Promise.resolve()
      expect(collectProject).toHaveBeenCalledOnce()
      second()
      await vi.waitFor(() => expect(collectProject).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      const retired = model.suspendDiscovery()
      model.invalidate('a:b')
      model.close()
      retired()
      await Promise.resolve()
      expect(collectProject).toHaveBeenCalledTimes(2)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('resumes changed-story discovery queued during assertion execution with Watch off', async () => {
    const { session, collection } = await setup()
    const gate = deferred<any>()
    const empty = { ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] }
    const run = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(empty)
    const collectStory = vi.fn(async (id: string) => collection(true, id))
    const model = createWorkbenchTestsModel(session, undefined, { collectProject: async () => collection(false), collectStory, run })
    try {
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      const operation = model.runAll()
      model.invalidate('a:b')
      await Promise.resolve()
      expect(collectStory).not.toHaveBeenCalled()
      gate.resolve(empty)
      await operation
      await vi.waitFor(() => expect(model.visibleRows.value).toHaveLength(1))
      expect(collectStory).toHaveBeenCalledExactlyOnceWith('a:b', expect.any(AbortSignal))
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it('executes affected hidden variants in Watch and replaces collection after tests disappear', async () => {
    const { session, collection } = await setup()
    const test = { id: '0', name: 'test', fullName: 'test', state: 'passed' as const, errors: [] }
    const run = vi.fn().mockResolvedValueOnce({ ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [test] }).mockResolvedValue({ ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] })
    const model = createWorkbenchTestsModel(session, undefined, { collectProject: async () => collection(false), run })
    try {
      await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
      model.setWatch(true)
      model.invalidate('a:b')
      await vi.waitFor(() => expect(model.summary.value.passed).toBe(1))
      expect(run.mock.calls.map(([target]) => target.variantId)).toEqual(['c', 'other'])
      model.invalidate('a:b')
      await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(4))
      expect(model.visibleRows.value).toHaveLength(0)
    }
    finally {
      model.close()
      await session.dispose()
    }
  })

  it.each(['source', 'disconnect', 'close'])('retires delayed discovery on %s', async (retirement) => {
    const { fixture, session, collection } = await setup()
    const gate = deferred<HistoireProjectTestCollectionResult>()
    const original = collection()
    const collectProject = vi.fn().mockReturnValueOnce(gate.promise).mockImplementation(async () => collection(false))
    const model = createWorkbenchTestsModel(session, undefined, { collectProject })
    try {
      await vi.waitFor(() => expect(collectProject).toHaveBeenCalledOnce())
      const signal = collectProject.mock.calls[0][0] as AbortSignal
      if (retirement === 'source') {
        fixture.descriptor.epoch = 'replacement'
        fixture.emitCatalog()
      }
      else if (retirement === 'disconnect') {
        fixture.emitDisconnect()
      }
      else {
        model.close()
      }
      expect(signal.aborted).toBe(true)
      gate.resolve(original)
      await vi.waitFor(() => expect(model.visibleRows.value).toHaveLength(0))
      if (retirement === 'source') await vi.waitFor(() => expect(collectProject).toHaveBeenCalledTimes(2))
    }
    finally {
      model.close()
      await session.dispose()
    }
  })
})
