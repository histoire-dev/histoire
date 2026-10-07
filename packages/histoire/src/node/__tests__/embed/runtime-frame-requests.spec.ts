// @vitest-environment jsdom
import { COLLECT_TESTS, RUNTIME_REQUEST, RUNTIME_RESULT, TEST_DEFINITIONS, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'
import { flushMicrotasks } from '../utils/flush.js'

/** Mount genuine SDK and iframe adapter; layout does not affect request authority. */
async function readyFrame() {
  const fixture = await createRuntimeFrameFixture({ requestTimeout: 100 })
  const frame = fixture.container.querySelector('iframe')!
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  publishFrameMessage(frame, VARIANT_READY)
  await fixture.primary.ready
  // Readiness schedules one unrelated geometry animation frame.
  vi.advanceTimersToNextFrame()
  return { ...fixture, frame, post }
}

/** Read an exact request after SDK's asynchronous dispatch reaches its iframe. */
async function sent(test: Awaited<ReturnType<typeof readyFrame>>, type: string, index = 0) {
  await flushMicrotasks()
  const messages = test.post.mock.calls.map(([message]) => message).filter(message => message.type === type)
  expect(messages.length).toBeGreaterThan(index)
  return messages[index] as Record<string, any>
}

describe('runtime iframe request authority', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class {
      /** Geometry stays outside transport assertions. */
      observe = vi.fn()
      /** Fixture must release document observer. */
      disconnect = vi.fn()
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each(['source', 'origin', 'missingOrigin', 'marker', 'document', 'story', 'variant', 'request'] as const)('ignores forged %s reply without settling collection', async (field) => {
    const test = await readyFrame()
    try {
      let settled = false
      const collection = test.session.tests.collect({ mode: 'preview' }).finally(() => settled = true)
      const request = await sent(test, COLLECT_TESTS)
      expect(request).toMatchObject({ __histoire: true, storyId: 'a:b', variantId: 'c' })
      expect(test.post.mock.calls.find(([message]) => message.type === COLLECT_TESTS)?.[1]).toBe(window.location.origin)
      const data = { ...request, type: TEST_DEFINITIONS, definitions: [{ id: 'forged', name: 'forged', fullName: 'forged' }] }
      if (field === 'marker') delete data.__histoire
      if (field === 'document') delete data.documentId
      if (field === 'story') delete data.storyId
      if (field === 'variant') delete data.variantId
      if (field === 'request') Object.assign(data, { requestId: 'retired', runId: 'retired' })
      window.dispatchEvent(new MessageEvent('message', {
        source: field === 'source' ? window : test.frame.contentWindow,
        origin: field === 'origin' ? 'https://foreign.example' : field === 'missingOrigin' ? '' : window.location.origin,
        data,
      }))
      await flushMicrotasks()
      expect(settled).toBe(false)
      publishFrameMessage(test.frame, TEST_DEFINITIONS, undefined, { requestId: request.requestId, definitions: [{ id: 'current', name: 'current', fullName: 'current' }] })
      await expect(collection).resolves.toMatchObject({ definitions: [{ id: 'current' }] })
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { await test.close() }
  })

  it('releases timed-out collection and rejects its late reply before a successor settles', async () => {
    const test = await readyFrame()
    try {
      const first = test.session.tests.collect({ mode: 'preview' }).catch(error => error.code)
      const predecessor = await sent(test, COLLECT_TESTS)
      await vi.advanceTimersByTimeAsync(100)
      expect(await first).toBe('TIMEOUT')
      let settled = false
      const second = test.session.tests.collect({ mode: 'preview' }).finally(() => settled = true)
      const successor = await sent(test, COLLECT_TESTS, 1)
      expect(successor.requestId).not.toBe(predecessor.requestId)
      publishFrameMessage(test.frame, TEST_DEFINITIONS, undefined, { requestId: predecessor.requestId, definitions: [{ id: 'stale', name: 'stale' }] })
      await flushMicrotasks()
      expect(settled).toBe(false)
      publishFrameMessage(test.frame, TEST_DEFINITIONS, undefined, { requestId: successor.requestId, definitions: [] })
      await expect(second).resolves.toMatchObject({ definitions: [] })
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { await test.close() }
  })

  it('retires pending state request on navigation and keeps stale document from successor', async () => {
    const test = await readyFrame()
    try {
      const first = test.session.state.get().catch(error => error.code)
      const predecessor = await sent(test, RUNTIME_REQUEST)
      const selection = test.session.selection.select({ storyId: 'a', variantId: 'b:c' })
      await flushMicrotasks()
      // jsdom replaces contentWindow on src assignment instead of retaining a WindowProxy.
      test.post = vi.spyOn(test.frame.contentWindow!, 'postMessage').mockImplementation(() => {})
      publishFrameMessage(test.frame, VARIANT_READY, undefined, { storyId: 'a', variantId: 'b:c' })
      await selection
      vi.advanceTimersToNextFrame()
      expect(await first).toBe('RUNTIME_CHANGED')
      let settled = false
      const second = test.session.state.get().finally(() => settled = true)
      const successor = await sent(test, RUNTIME_REQUEST)
      expect(successor.documentId).not.toBe(predecessor.documentId)
      publishFrameMessage(test.frame, RUNTIME_RESULT, predecessor.documentId, { storyId: 'a', variantId: 'b:c', requestId: successor.requestId, result: { text: 'stale' } })
      await flushMicrotasks()
      expect(settled).toBe(false)
      publishFrameMessage(test.frame, RUNTIME_RESULT, undefined, { storyId: 'a', variantId: 'b:c', requestId: successor.requestId, result: { text: 'current' } })
      await expect(second).resolves.toMatchObject({ value: { text: 'current' } })
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { await test.close() }
  })

  it('removes actual iframe and clears deadlines when owner closes during collection', async () => {
    const test = await readyFrame()
    const collection = test.session.tests.collect({ mode: 'preview' }).catch(error => error.code)
    await sent(test, COLLECT_TESTS)
    await test.close()
    expect(await collection).toBe('DISPOSED')
    expect(test.frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
