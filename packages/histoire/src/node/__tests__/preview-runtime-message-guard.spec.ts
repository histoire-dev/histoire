import { describe, expect, it, vi } from 'vitest'
import {
  COLLECT_TESTS,
  PREVIEW_SETTINGS_SYNC,
  PREVIEW_SYNC,
  RUN_TESTS,
  SANDBOX_READY,
  SELECT_VARIANT,
  STATE_SYNC,
  TEST_DEFINITIONS,
  TEST_RESULT,
} from '../../../../histoire-app/src/app/util/const.js'
import { previewMessageHandler } from '../virtual/preview-runtime/message-handler.js'

/**
 * Executes the generated inbound message listener of the preview runtime.
 *
 * The listener is emitted as source text inside the app `setup()` body, so it
 * is run here in a `with` scope that supplies its free identifiers. Anything the
 * exercised branch does not stub resolves to `undefined` (or the real global),
 * which is enough to observe the guard and the two test-related branches.
 */
function createPreviewRuntime(options: { onCollect?: () => void, onRun?: () => void } = {}) {
  const postToParent = vi.fn()
  const collectVariantTests = vi.fn(async () => {
    options.onCollect?.()
    return [{ id: '0', mode: 'run', name: 'a' }]
  })
  const runVariantTests = vi.fn(async () => {
    options.onRun?.()
    return { total: 1, passed: 1, failed: 0, skipped: 0, tests: [] }
  })
  const setCollectedTestDefinitions = vi.fn()
  const syncSelection = vi.fn(async () => {})
  let listener: (event: any) => Promise<void>

  // The window embedding the sandbox, as `getHostWindow()` resolves it.
  const hostWindow = {}
  const story: { value: { id: string } | null } = { value: { id: 'story-a' } }
  const variant: { value: { id: string } | null } = { value: { id: 'variant-a' } }
  const stubs: Record<string, any> = {
    getHostWindow: () => hostWindow,
    window: {
      location: { origin: 'http://localhost:3000' },
      addEventListener: (type: string, handler: any) => {
        if (type === 'message') {
          listener = handler
        }
      },
    },
    COLLECT_TESTS,
    PREVIEW_SETTINGS_SYNC,
    PREVIEW_SYNC,
    RUN_TESTS,
    SANDBOX_READY,
    SELECT_VARIANT,
    STATE_SYNC,
    TEST_DEFINITIONS,
    TEST_RESULT,
    postToParent,
    postVariantStateSnapshot: vi.fn(),
    syncSelection,
    story,
    variant,
    variantTestSession: { collectVariantTests },
    runVariantTests,
    setCollectedTestDefinitions,
    serializeTestError: (error: Error) => ({ message: error.message }),
    createFailedRunSummary: () => ({ total: 0, passed: 0, failed: 1, skipped: 0, tests: [] }),
  }

  const scope = new Proxy(stubs, {
    has: () => true,
    get: (target, key) => (key in target ? target[key] : (globalThis as any)[key as any]),
  })
  // eslint-disable-next-line no-new-func -- the runtime only exists as source text
  new Function('scope', `with (scope) { ${previewMessageHandler()} }`)(scope)

  return {
    postToParent,
    collectVariantTests,
    runVariantTests,
    syncSelection,
    story,
    variant,
    /** Delivers a message to the runtime, awaiting the async dispatch. */
    async deliver(data: Record<string, any>, overrides: { source?: unknown, origin?: string } = {}) {
      await listener!({
        source: 'source' in overrides ? overrides.source : hostWindow,
        origin: overrides.origin ?? 'http://localhost:3000',
        data,
      })
    },
  }
}

describe('preview runtime inbound message guard', () => {
  it('ignores test requests that do not carry the histoire marker', async () => {
    const runtime = createPreviewRuntime()

    await runtime.deliver({ type: COLLECT_TESTS, requestId: '1', variantKey: 'story-a:variant-a' })
    await runtime.deliver({ type: RUN_TESTS, runId: '1', variantKey: 'story-a:variant-a' })

    // The marker check used to exempt these two types, which made the host's
    // outbound messages the only unmarked traffic in the whole protocol.
    expect(runtime.collectVariantTests).not.toHaveBeenCalled()
    expect(runtime.runVariantTests).not.toHaveBeenCalled()
    expect(runtime.postToParent).not.toHaveBeenCalled()
  })

  it('answers marked test requests', async () => {
    const runtime = createPreviewRuntime()

    await runtime.deliver({ __histoire: true, type: COLLECT_TESTS, requestId: '1', variantKey: 'story-a:variant-a' })
    expect(runtime.collectVariantTests).toHaveBeenCalledWith('story-a', 'variant-a')
    expect(runtime.postToParent).toHaveBeenLastCalledWith(expect.objectContaining({
      type: TEST_DEFINITIONS,
      requestId: '1',
      variantKey: 'story-a:variant-a',
    }))

    await runtime.deliver({ __histoire: true, type: RUN_TESTS, runId: '2', variantKey: 'story-a:variant-a' })
    expect(runtime.runVariantTests).toHaveBeenCalled()
    expect(runtime.postToParent).toHaveBeenLastCalledWith(expect.objectContaining({
      type: TEST_RESULT,
      runId: '2',
      variantKey: 'story-a:variant-a',
    }))
  })

  it('ignores every message type from a foreign frame or origin', async () => {
    const runtime = createPreviewRuntime()
    const message = { __histoire: true, type: PREVIEW_SYNC, storyId: 'story-a', variantId: 'variant-a' }

    await runtime.deliver(message, { source: { notTheParent: true } })
    await runtime.deliver(message, { origin: 'http://evil.test' })
    expect(runtime.syncSelection).not.toHaveBeenCalled()

    // …and accepts the same message from the host.
    await runtime.deliver(message)
    expect(runtime.syncSelection).toHaveBeenCalledTimes(1)
  })

  it('tags replies with the variant it actually worked on, not the one selected afterwards', async () => {
    // A SELECT_VARIANT/PREVIEW_SYNC processed during the collect/run await flips
    // the live selection. Tagging the reply with the post-await value would name
    // the variant that was NOT collected: the host drops the mismatch and the
    // request stalls until its timeout.
    const runtime: ReturnType<typeof createPreviewRuntime> = createPreviewRuntime({
      onCollect: () => {
        runtime.story.value = { id: 'story-b' }
        runtime.variant.value = { id: 'variant-b' }
      },
    })

    await runtime.deliver({ __histoire: true, type: COLLECT_TESTS, requestId: '1', variantKey: 'story-a:variant-a' })

    expect(runtime.postToParent).toHaveBeenLastCalledWith(expect.objectContaining({
      variantKey: 'story-a:variant-a',
    }))
  })

  it('answers about nothing when no story is selected, so the host can retry', async () => {
    const runtime = createPreviewRuntime()
    runtime.story.value = null
    runtime.variant.value = null

    await runtime.deliver({ __histoire: true, type: COLLECT_TESTS, requestId: '1', variantKey: 'story-a:variant-a' })
    await runtime.deliver({ __histoire: true, type: RUN_TESTS, runId: '2', variantKey: 'story-a:variant-a' })

    // Echoing the requested key instead would report "this variant has no
    // tests" (or a failed run) for a variant that never even loaded.
    expect(runtime.collectVariantTests).not.toHaveBeenCalled()
    expect(runtime.runVariantTests).not.toHaveBeenCalled()
    for (const call of runtime.postToParent.mock.calls) {
      expect(call[0].variantKey).toBeNull()
    }
  })

  it('ignores an unmarked selection message', async () => {
    const runtime = createPreviewRuntime()

    await runtime.deliver({ type: PREVIEW_SYNC, storyId: 'story-a', variantId: 'variant-a' })

    expect(runtime.syncSelection).not.toHaveBeenCalled()
  })
})
