import { describe, expect, it } from 'vitest'
import {
  COLLECT_TESTS,
  HOST_CHANNEL_MESSAGE,
  PREVIEW_SYNC,
  RUN_TESTS,
  RUNTIME_REQUEST,
  SELECT_VARIANT,
  STATE_SYNC,
  TEST_DEFINITIONS,
  TEST_RESULT,
} from '../../../../histoire-app/src/app/util/const.js'
import { createPreviewRuntime } from './utils/preview-runtime-message.js'

describe('preview runtime inbound message guard', () => {
  it('rejects stale same-document variant intents before changing source selection', async () => {
    const runtime = createPreviewRuntime()
    await runtime.deliver({ __histoire: true, type: PREVIEW_SYNC, storyId: 'story-a', variantId: 'variant-a', documentId: 'document', selectionVersion: 2 })
    for (const selectionVersion of [1, -1, 0.5, '3', Number.MAX_SAFE_INTEGER + 1]) {
      await runtime.deliver({ __histoire: true, type: PREVIEW_SYNC, storyId: 'story-a', variantId: 'stale', documentId: 'document', selectionVersion })
    }
    expect(runtime.syncSelection).toHaveBeenCalledOnce()
    await runtime.deliver({ __histoire: true, type: PREVIEW_SYNC, storyId: 'story-a', variantId: 'variant-b', documentId: 'document', selectionVersion: 3 })
    expect(runtime.syncSelection).toHaveBeenCalledTimes(2)
  })
  it('does not apply older controls acknowledgment while newer local edit is in transit', async () => {
    const runtime = createPreviewRuntime({ controls: true })
    const previous = runtime.controlsRevision.capture()
    const current = runtime.controlsRevision.capture()
    const message = { __histoire: true, type: STATE_SYNC, documentId: 'document', variantId: 'variant-a', state: { text: 'new' } }
    await runtime.deliver({ ...message, controlsRevision: previous })
    await runtime.deliver({ ...message, controlsRevision: '2' })
    await runtime.deliver({ ...message, documentId: 'old', controlsRevision: current })
    expect(runtime.applyVariantStateUpdate).not.toHaveBeenCalled()
    await runtime.deliver({ ...message, controlsRevision: current })
    expect(runtime.applyVariantStateUpdate).toHaveBeenCalledOnce()
    await runtime.deliver(message)
    expect(runtime.applyVariantStateUpdate).toHaveBeenCalledTimes(2)
  })
  it('requires exact document and selected actor for new channels while isolating application failures', async () => {
    const runtime = createPreviewRuntime()
    const message = { __histoire: true, type: HOST_CHANNEL_MESSAGE, channel: { name: 'factory', type: 'application', data: null }, storyId: 'story-a', variantId: 'variant-a' }
    await runtime.deliver(message)
    await runtime.deliver({ ...message, documentId: 'old' })
    await runtime.deliver({ ...message, documentId: 'document', variantId: 'other' })
    await runtime.deliver({ ...message, documentId: 'document' }, { source: {} })
    expect(runtime.channelReceive).not.toHaveBeenCalled()
    await runtime.deliver({ ...message, documentId: 'document' })
    expect(runtime.channelReceive).toHaveBeenCalledWith(message.channel, { storyId: 'story-a', variantId: 'variant-a' })
    await runtime.deliver({ ...message, type: RUNTIME_REQUEST, command: 'channel.post' })
    expect(runtime.handleRuntimeRequest).not.toHaveBeenCalled()
    await runtime.deliver({ ...message, type: RUNTIME_REQUEST, command: 'channel.post', documentId: 'document' })
    expect(runtime.handleRuntimeRequest).toHaveBeenCalledOnce()
    runtime.channelReceive.mockImplementation(() => {
      throw new Error('Application admission failure')
    })
    await expect(runtime.deliver({ ...message, documentId: 'document' })).resolves.toBeUndefined()
  })
  it('drops old or malformed grid versions while retaining legacy host selection', async () => {
    const runtime = createPreviewRuntime()
    await runtime.deliver({ __histoire: true, type: SELECT_VARIANT, variantId: 'current', selectionVersion: 2 })
    for (const selectionVersion of [1, -1, 2.5, Number.NaN]) {
      await runtime.deliver({ __histoire: true, type: SELECT_VARIANT, variantId: 'stale', selectionVersion })
      expect(runtime.gridSelectedVariantId.value).toBe('current')
    }
    await runtime.deliver({ __histoire: true, type: SELECT_VARIANT, variantId: 'legacy' })
    expect(runtime.gridSelectedVariantId.value).toBe('legacy')
    await runtime.deliver({ __histoire: true, type: SELECT_VARIANT, variantId: 'new', selectionVersion: 3 })
    expect(runtime.gridSelectedVariantId.value).toBe('new')
  })
  it.each([
    { storyId: 'story' },
    { variantId: 'variant' },
    { documentId: 'old-document' },
    { mcpNonce: 'other' },
    { mcpEpoch: 'other' },
  ])('rejects mismatched automated test authority %j before side effects', async (mismatch) => {
    const runtime = createPreviewRuntime()
    const authority = { __histoire: true, storyId: 'story-a', variantId: 'variant-a', documentId: 'document', mcpNonce: 'nonce', mcpEpoch: 'epoch', ...mismatch }
    await runtime.deliver({ ...authority, type: COLLECT_TESTS, requestId: 'collect' })
    await runtime.deliver({ ...authority, type: RUN_TESTS, runId: 'run' })
    expect(runtime.collectVariantTests).not.toHaveBeenCalled()
    expect(runtime.runVariantTests).not.toHaveBeenCalled()
  })

  it('echoes independent automation authority with actual tuple', async () => {
    const runtime = createPreviewRuntime()
    await runtime.deliver({ __histoire: true, type: COLLECT_TESTS, requestId: 'collect', storyId: 'story-a', variantId: 'variant-a', documentId: 'document', mcpNonce: 'nonce', mcpEpoch: 'epoch' })
    expect(runtime.postToParent).toHaveBeenLastCalledWith(expect.objectContaining({ storyId: 'story-a', variantId: 'variant-a', mcpNonce: 'nonce', mcpEpoch: 'epoch' }))
  })
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
