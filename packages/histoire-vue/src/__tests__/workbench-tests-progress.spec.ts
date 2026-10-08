import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'
import { expect, it, vi } from 'vitest'
import { createWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import { deferred } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireTestsModel } from '../tests/model.js'
import { setupTestDiscovery } from './fixtures/test-discovery.js'

it('retries an HMR admission rejected before its newer source publication arrives', async () => {
  const { fixture, session, collection } = await setupTestDiscovery()
  let attempts = 0
  const model = createWorkbenchTestsModel(session, undefined, { collectProject: async () => {
    if (++attempts === 1) throw new HistoireSdkError('RUNTIME_CHANGED', 'Test source owner changed')
    return collection()
  } })
  try {
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('error'))
    fixture.descriptor.revision = 'after-hmr'
    fixture.emitCatalog()
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
    expect(attempts).toBe(2)
    expect(model.discoveryError.value).toBeNull()
    expect(model.discoveryProgress.value).toEqual({ completed: 3, total: 3 })
    expect(model.visibleRows.value).toHaveLength(1)
  }
  finally {
    model.close()
    await session.dispose()
  }
})

it('automatically retries HMR when retired collection rejects after newer work is queued', async () => {
  const { session, collection } = await setupTestDiscovery()
  const gate = deferred<HistoireProjectTestCollectionResult>()
  let attempts = 0
  const model = createWorkbenchTestsModel(session, undefined, { collectProject: () => ++attempts === 1 ? gate.promise : Promise.resolve(collection()) })
  try {
    await vi.waitFor(() => expect(attempts).toBe(1))
    model.invalidate('a:b')
    gate.reject(new Error('Test collection dependency graph changed'))
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
    expect(attempts).toBe(2)
    expect(model.discoveryError.value).toBeNull()
    expect(model.visibleRows.value).toHaveLength(1)
  }
  finally {
    model.close()
    await session.dispose()
  }
})

it('retains its own partial evidence while newer selected-target definitions win', async () => {
  const { session, collection } = await setupTestDiscovery()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const selected = createHistoireTestsModel(session)
  const gate = deferred<HistoireProjectTestCollectionResult>()
  let publish: ((result: HistoireProjectTestCollectionResult) => void) | undefined
  const model = createWorkbenchTestsModel(session, selected, { collectProject: (_signal, progress) => {
    publish = progress
    return gate.promise
  } })
  try {
    await vi.waitFor(() => expect(publish).toBeTypeOf('function'))
    const result = collection()
    publish!({ ...result, variants: [result.variants[0]] })
    selected.state.value = { ...selected.state.value, status: 'idle', collection: { definitions: [{ id: 'newer', name: 'newer', fullName: 'newer' }] }, error: null }
    gate.resolve(result)
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
    expect(model.discoveryProgress.value).toEqual({ completed: 3, total: 3 })
    expect(model.visibleRows.value[0].collection?.definitions[0].name).toBe('newer')
  }
  finally {
    model.close()
    selected.controller.close()
    await session.dispose()
  }
})

it('publishes completed definitions while pending, preserves them after failure, and retries', async () => {
  const { session, collection } = await setupTestDiscovery()
  const gate = deferred<HistoireProjectTestCollectionResult>()
  let publish: ((result: HistoireProjectTestCollectionResult) => void) | undefined
  let attempts = 0
  const model = createWorkbenchTestsModel(session, undefined, { collectProject: async (_signal, progress) => {
    if (++attempts > 1) return collection()
    publish = progress
    return gate.promise
  } })
  try {
    await vi.waitFor(() => expect(publish).toBeTypeOf('function'))
    const result = collection()
    publish!({ ...result, variants: [result.variants[0]] })
    expect(model.discoveryStatus.value).toBe('collecting')
    expect(model.discoveryProgress.value).toEqual({ completed: 1, total: 3 })
    expect(model.visibleRows.value).toHaveLength(1)
    expect(model.summary.value).toMatchObject({ passed: 0, failed: 0, idle: 1 })
    gate.reject(new Error('Remaining setup failed'))
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('error'))
    expect(model.visibleRows.value).toHaveLength(1)
    expect(model.discoveryProgress.value).toEqual({ completed: 1, total: 3 })
    model.retryCollection()
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('completed'))
    expect(model.discoveryProgress.value).toEqual({ completed: 3, total: 3 })
    expect(model.discoveryError.value).toBeNull()
    expect(model.visibleRows.value).toHaveLength(1)
  }
  finally {
    model.close()
    await session.dispose()
  }
})

it.each(['source', 'hmr', 'run', 'suspend', 'close'])('drops progress after %s retires request', async (retirement) => {
  const { fixture, session, collection } = await setupTestDiscovery()
  const gate = deferred<HistoireProjectTestCollectionResult>()
  const original = collection()
  let publish: ((result: HistoireProjectTestCollectionResult) => void) | undefined
  const model = createWorkbenchTestsModel(session, undefined, { collectProject: (_signal, progress) => {
    publish ??= progress
    return gate.promise
  }, run: async () => ({ ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] }) })
  try {
    await vi.waitFor(() => expect(publish).toBeTypeOf('function'))
    if (retirement === 'source') {
      fixture.descriptor.epoch = 'replacement'
      fixture.emitCatalog()
    }
    if (retirement === 'hmr') model.invalidate('a:b')
    if (retirement === 'run') await model.runAll()
    if (retirement === 'suspend') model.suspendDiscovery()
    if (retirement === 'close') model.close()
    publish!(original)
    gate.resolve(collection(false))
    await Promise.resolve()
    expect(model.visibleRows.value).toHaveLength(0)
  }
  finally {
    model.close()
    await session.dispose()
  }
})

it.each(['source', 'target', 'duplicate'])('rejects foreign %s inventory before publishing any definitions', async (foreign) => {
  const { session, collection } = await setupTestDiscovery()
  const model = createWorkbenchTestsModel(session, undefined, { collectProject: async (_signal, publish) => {
    const result = collection()
    if (foreign === 'source') publish!({ ...result, execution: { ...result.execution, sourceId: 'another-book' } })
    if (foreign === 'target') publish!({ ...result, variants: [{ ...result.variants[0], target: { storyId: 'another-book', variantId: 'c' } }] })
    if (foreign === 'duplicate') publish!({ ...result, variants: [result.variants[0], result.variants[0]] })
    return result
  } })
  try {
    await vi.waitFor(() => expect(model.discoveryStatus.value).toBe('error'))
    expect(model.discoveryError.value).toMatchObject({ code: foreign === 'source' ? 'STALE_REVISION' : 'INVALID_ARGUMENT' })
    expect(model.visibleRows.value).toHaveLength(0)
  }
  finally {
    model.close()
    await session.dispose()
  }
})
