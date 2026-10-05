import type { ProjectServices } from '../../api/internal.js'
import { describe, expect, it, vi } from 'vitest'
import { runProjectTests } from '../../api/tests.js'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'

const task = vi.hoisted(() => vi.fn(() => ({ run: async () => ({ ok: true, total: 0, passed: 0, failed: 0, tests: [], errors: [], duration: 0 }) })))
vi.mock('../../test/execution-service.js', () => ({ createHistoireTestTask: task }))

/** Minimal published catalog exercises admission before existing runner starts. */
function fixture(failed = false) {
  const execution = createExecutionService()
  const snapshot = { failed, stories: [{ id: 'known', variants: [{ id: 'main' }] }] }
  const services = { execution, dev: { handle: { status: 'ready' }, controller: { current: { context: {}, isActive: () => true } }, catalog: { current: snapshot }, execution: createExecutionOwner(execution) } } as unknown as ProjectServices
  return { services, execution }
}

describe('explicit Node test admission', () => {
  it('rejects malformed IDs and missing story-only targets without admitting runner', async () => {
    const test = fixture()
    const before = task.mock.calls.length
    try {
      for (const options of [{ storyId: '' }, { storyId: 1 }, { storyId: 'known', variantId: '' }, { storyId: 'known', variantId: 1 }]) {
        await expect(runProjectTests(test.services, options as any)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
      }
      await expect(runProjectTests(test.services, { storyId: 'unknown' })).rejects.toMatchObject({ code: 'STORY_NOT_FOUND' })
      await expect(runProjectTests(test.services, { storyId: 'known', variantId: 'missing' })).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' })
      expect(task.mock.calls.length).toBe(before)
    }
    finally { await test.execution.close() }
  })

  it('keeps failed collection distinct from absent tests and permits story-only execution', async () => {
    const test = fixture(true)
    try {
      await expect(runProjectTests(test.services, { storyId: 'unknown' })).rejects.toMatchObject({ code: 'COLLECTION_FAILED' })
      await expect(runProjectTests(test.services, { storyId: 'known' })).resolves.toMatchObject({ ok: true, total: 0 })
      expect(task.mock.lastCall?.[1]).toEqual({ storyId: 'known', variantId: undefined })
    }
    finally { await test.execution.close() }
  })
})
