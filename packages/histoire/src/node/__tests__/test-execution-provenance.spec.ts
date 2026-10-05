import { mergeHistoireTestSummaries } from '@histoire/shared'
import { afterEach, expect, it, vi } from 'vitest'
import * as attachment from '../runtime/catalog/attachment.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { createHistoireTestCollectionTask, createHistoireTestTask } from '../test/execution-service.js'
import { createEmbedSource } from '../virtual/embed/source.js'
import { createEmbedSourceFixture } from './utils/embed/source.js'
import { flushMicrotasks } from './utils/flush.js'

afterEach(() => vi.restoreAllMocks())

it.each([createHistoireTestTask, createHistoireTestCollectionTask])('attributes %s to captured portable source identity, epoch and revision', async (createTask) => {
  const fixture = await createEmbedSourceFixture()
  try {
    vi.spyOn(attachment, 'getRuntimeCatalogForContext').mockReturnValue({ catalog: fixture.catalog, ready: Promise.resolve(), close: () => {} })
    const summary = { ...mergeHistoireTestSummaries([]), execution: { runId: 'owned-run', mode: 'server' as const } }
    vi.doMock('../test/index.js', () => ({ runHistoireTests: vi.fn(async () => summary) }))
    vi.doMock('../test/collect.js', () => ({ collectHistoireProjectTests: vi.fn(async () => ({ execution: summary.execution, variants: [] })) }))
    const descriptor = createEmbedSource(fixture.context, fixture.catalog, 'local').getDescriptor()
    expect(descriptor.sourceId).not.toBe(fixture.catalog.current.projectId)
    const task = createTask(fixture.context, {})

    const result = await task.run(new AbortController().signal)

    expect(result.execution).toMatchObject({ sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision })
  }
  finally { await fixture.close() }
})

it.each([createHistoireTestTask, createHistoireTestCollectionTask])('rejects retired %s before runner acquisition and after completion', async (createTask) => {
  const fixture = await createEmbedSourceFixture()
  const execution = createExecutionService()
  try {
    vi.spyOn(attachment, 'getRuntimeCatalogForContext').mockReturnValue({ catalog: fixture.catalog, ready: Promise.resolve(), close: () => {} })
    const runner = vi.fn(async () => mergeHistoireTestSummaries([]))
    vi.doMock('../test/index.js', () => ({ runHistoireTests: runner }))
    vi.doMock('../test/collect.js', () => ({ collectHistoireProjectTests: runner }))
    let release!: () => void
    const blocker = execution.enqueue({ run: () => new Promise<void>((done) => {
      release = done
    }) })
    await flushMicrotasks()
    const retired = execution.enqueue(createTask(fixture.context, {}))
    fixture.story.story.title = 'Retired before lane head'
    await fixture.catalog.publish(fixture.context)
    release()
    await blocker.result
    await expect(retired.result).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(runner).not.toHaveBeenCalled()

    const current = createTask(fixture.context, {})
    runner.mockImplementationOnce(async () => {
      fixture.story.story.title = 'Retired during run'
      await fixture.catalog.publish(fixture.context)
      return mergeHistoireTestSummaries([])
    })
    await expect(current.run(new AbortController().signal)).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(runner).toHaveBeenCalledOnce()
  }
  finally {
    await execution.close()
    await fixture.close()
  }
})
