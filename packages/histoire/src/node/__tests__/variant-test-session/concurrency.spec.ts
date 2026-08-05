import type { HistoireTestRegistration } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { it as collectIt } from '../../vendors/vitest-collect.js'
import { createSessionOptions, MOCK_CANVAS_TEXT, STORY_ID, VARIANT_ID } from '../utils/variant-test-session.js'

describe('createVariantTestSession concurrency', () => {
  it('serializes overlapping collect and run flows so the global registry is not corrupted', async () => {
    // A manually-resolvable promise used to force the interleaving that would
    // corrupt the shared `__HST_TEST_REGISTRY__` global without a lock.
    let releaseFirstMount: () => void = () => {}
    const firstMountGate = new Promise<void>((resolve) => {
      releaseFirstMount = resolve
    })

    // Records when each flow's mount starts/ends so we can assert non-overlap.
    const order: string[] = []
    let mountCalls = 0

    // Each flow registers its own test under a distinct name. Because the
    // registration captures the *currently installed* global registry array,
    // a corrupted registry would either throw "Could not resolve" or push the
    // test into the wrong flow's definition list (cross-contamination).
    function makeRegistration(flowName: string): HistoireTestRegistration {
      return ({ canvas }) => {
        collectIt(`${flowName} test`, () => {
          expect(canvas.textContent).toContain('cache invalidation')
        })
      }
    }

    // This spec needs deferred-gated, per-flow mount implementations rather than
    // the shared mount mock, so it wires its own.
    vi.resetModules()
    vi.doMock('../../virtual/variant-test-mount.js', () => ({
      bootstrapVariant: vi.fn(async (_file: any, _variantId: string, withRegistry: any) => {
        const registrations: HistoireTestRegistration[] = []
        await withRegistry(registrations, false, () => {})
        return {
          registrations,
          ownExecutionIds: new Set<number>(),
          cleanup() {},
        }
      }),
      mountRenderVariant: vi.fn(async (file: any, variantId: string, withRegistry: any) => {
        const flowIndex = ++mountCalls
        const flowName = `flow-${flowIndex}`
        order.push(`start ${flowName}`)

        const registrations: HistoireTestRegistration[] = [makeRegistration(flowName)]

        // Gate the FIRST flow's mount on the deferred so the SECOND flow gets a
        // chance to begin while the first is mid-`withRegistry`. Without the
        // lock this interleaves the global save/restore; with the lock the
        // second flow cannot even start until the first finishes.
        await withRegistry(registrations, true, async () => {
          if (flowIndex === 1) {
            await firstMountGate
          }
        })

        order.push(`end ${flowName}`)

        return {
          story: file.story,
          variant: file.story.variants.find((item: any) => item.id === variantId),
          canvas: {
            textContent: MOCK_CANVAS_TEXT,
          },
          registrations,
          ownExecutionIds: new Set<number>(),
          cleanup() {},
        }
      }),
    }))

    const { createVariantTestSession } = await import('../../virtual/variant-test-session/index.js')

    const session = createVariantTestSession(createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: vi.fn(async () => ({ default: { name: 'OverlapComponent' } })),
      },
    }))

    // Start both flows without awaiting, so they would overlap if unserialized.
    const collectPromise = session.collectVariantTests(STORY_ID, VARIANT_ID)
    const runPromise = session.runVariantTests(STORY_ID, VARIANT_ID)

    // Give the microtask queue a chance to advance both flows as far as they can
    // go. With serialization, the second flow's mount must still not have started.
    await Promise.resolve()
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))

    // The second flow's mount must NOT have started while the first is gated.
    expect(order).toEqual(['start flow-1'])

    // Release the first flow; the second may now proceed.
    releaseFirstMount()

    const [collected, summary] = await Promise.all([collectPromise, runPromise])

    // (a) Flows did not overlap: full start/end of flow-1 precedes start of flow-2.
    expect(order).toEqual([
      'start flow-1',
      'end flow-1',
      'start flow-2',
      'end flow-2',
    ])

    // (b) Each flow produced its OWN correct, uncorrupted result.
    expect(collected.map(definition => definition.name)).toEqual(['flow-1 test'])
    expect(summary.tests.map(test => test.name)).toEqual(['flow-2 test'])
    expect(summary.passed).toBe(1)
    expect(summary.failed).toBe(0)
  })
})
