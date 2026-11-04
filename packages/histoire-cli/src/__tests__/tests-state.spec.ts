import type { TestResultsPage } from '../terminal/protocol/tests.js'
import { describe, expect, it } from 'vitest'
import { followOperation } from '../terminal/tests/reporter.js'
import { createTestsState } from '../terminal/tests/state.js'
import { operation } from './tests-console-rig.js'

/** Client boundary: counts reads and answers with one case per call. */
function createClient() {
  const reads: string[] = []
  const client = {
    run: async () => operation('x', 'queued'),
    get: async () => operation('x', 'queued'),
    cancel: async () => operation('x', 'cancelling'),
    results: async (args: { operationId: string, cursor?: string }): Promise<TestResultsPage> => {
      reads.push(`${args.operationId}:${args.cursor ?? ''}`)
      return { operationId: args.operationId, cases: [{ id: '1', name: 'n', fullName: 'n', state: 'passed', errors: [] }], total: 1 }
    },
  }
  return { client, reads }
}

// Boundary: real parent cache fed with bridge-shaped events; the child is the
// only substituted side. Defects: late events moving an operation backwards,
// unbounded history, pages of a replaced child being reconstructed or refetched.
describe('terminal test cache', () => {
  it('never moves an operation backwards and keeps progress only while active', () => {
    const state = createTestsState({ client: createClient().client })
    state.onEvent('g1', 'tests.state', operation('a', 'running'))
    state.onEvent('g1', 'tests.progress', { operationId: 'a', progress: { phase: 'run', completed: 1, total: 4 } })
    expect(state.get('a')!.progress).toMatchObject({ completed: 1 })
    state.onEvent('g1', 'tests.state', operation('a', 'completed'))
    state.onEvent('g1', 'tests.state', operation('a', 'running'))
    state.onEvent('g1', 'tests.progress', { operationId: 'a', progress: { phase: 'run', completed: 2, total: 4 } })
    expect(state.get('a')).toMatchObject({ operation: { state: 'completed' }, progress: undefined })
    state.onEvent('g1', 'tests.state', { id: 'bad' })
    expect(state.snapshot()).toHaveLength(1)
  })

  it('bounds finished runs, never evicting active ones', () => {
    const state = createTestsState({ client: createClient().client, limits: { runs: 2, bytes: 1e9 } })
    state.onEvent('g1', 'tests.state', operation('active', 'running'))
    for (const id of ['a', 'b', 'c']) state.onEvent('g1', 'tests.state', operation(id, 'completed'))
    expect(state.snapshot().map(entry => entry.operation.id)).toEqual(['active', 'b', 'c'])
  })

  it('evicts by finish order, so a long run that just finished outlives earlier finished ones', () => {
    const state = createTestsState({ client: createClient().client, limits: { runs: 2, bytes: 1e9 } })
    state.onEvent('g1', 'tests.state', operation('long', 'running'))
    for (const id of ['a', 'b']) state.onEvent('g1', 'tests.state', operation(id, 'completed'))
    state.onEvent('g1', 'tests.state', operation('long', 'completed'))
    expect(state.snapshot().map(entry => entry.operation.id)).toEqual(['b', 'long'])
  })

  it('plain follow resolves when its operation is no longer retained', async () => {
    const state = createTestsState({ client: createClient().client, limits: { runs: 0, bytes: 1e9 } })
    const lines: string[] = []
    state.onEvent('g1', 'tests.state', operation('followed', 'running'))
    const done = followOperation({ state, subscribe: state.subscribe } as never, 'followed', line => lines.push(line))
    state.onEvent('g1', 'tests.state', operation('followed', 'completed'))
    await done
    expect(lines.at(-1)).toMatch(/no longer retained/)
  })

  it('caches fetched pages and reports unfetched pages of a retired generation as unavailable', async () => {
    const { client, reads } = createClient()
    const state = createTestsState({ client })
    state.onEvent('g1', 'tests.state', operation('done', 'completed'))
    state.onEvent('g1', 'tests.state', operation('live', 'running'))
    expect((await state.results('done')).cases).toHaveLength(1)
    await state.results('done')
    expect(reads).toEqual(['done:'])

    state.onRetired('g1')
    expect(state.get('live')!.lost).toBe(true)
    expect(state.get('done')!.lost).toBe(false)
    // Fetched page stays readable history; an unfetched one is gone with its child, never re-run or refetched.
    expect((await state.results('done')).cases).toHaveLength(1)
    expect(await state.results('done', { cursor: '1' })).toMatchObject({ unavailable: 'retired' })
    expect(await state.results('live')).toMatchObject({ unavailable: 'retired' })
    expect(await state.results('missing')).toMatchObject({ unavailable: 'unknown' })
    expect(reads).toEqual(['done:'])
  })

  it('drops cached pages before summaries when over the byte budget', async () => {
    const { client, reads } = createClient()
    const state = createTestsState({ client, limits: { runs: 20, bytes: 350 } })
    state.onEvent('g1', 'tests.state', operation('a', 'completed'))
    for (const cursor of ['0', '1', '2', '3', '0']) await state.results('a', { cursor })
    // Early pages were evicted by later ones and are read again; the summary stays.
    expect(reads.filter(read => read === 'a:0')).toHaveLength(2)
    expect(state.get('a')!.operation.state).toBe('completed')
  })
})
