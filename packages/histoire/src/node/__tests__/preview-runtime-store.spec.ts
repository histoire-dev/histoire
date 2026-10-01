import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT } from '../../../../histoire-app/src/app/util/const.js'
import { createPiniaStub } from './utils/app-store.js'
import { FAKE_ORIGIN, installFakeWindow } from './utils/fake-window.js'
import { flushMicrotasks } from './utils/flush.js'

/**
 * Behavioral tests for the app-side `usePreviewRuntimeStore`.
 *
 * The store is pure postMessage plumbing around a preview iframe, so it is
 * driven here with a fake `window`/iframe pair instead of a real DOM. Fake
 * timers are installed for every test: any assertion that completes without
 * advancing time proves the request settled on its own rather than waiting out
 * the 15s reply timeout.
 *
 * `pinia` is replaced by the shared stub (see `utils/app-store.ts`); `vue` is
 * left real, so the store's own reactivity runs unmodified.
 */

const ORIGIN = FAKE_ORIGIN

/** Minimal stand-in for an `HTMLIFrameElement` hosting the preview. */
interface FakeFrame {
  /** Vue's `ReactiveFlags.SKIP` — see `createFrame`. */
  __v_skip: true
  src: string
  contentWindow: { postMessage: ReturnType<typeof vi.fn> }
}

/** The fake document the store runs against, installed per test. */
let fakeWindow: ReturnType<typeof installFakeWindow>

/**
 * Creates a fake preview iframe recording every outbound postMessage call.
 *
 * The store keeps frames in a deep `ref` and Vue leaves real
 * `HTMLIFrameElement`s unproxied; a plain object would come back out wrapped in
 * a reactive proxy, so its `contentWindow` would no longer match the message
 * `source`. `vue` is not resolvable from this package, so the raw marker
 * `markRaw` would set is applied directly.
 *
 * @param src - Value of the iframe `src` attribute (drives the target origin).
 */
function createFrame(src = `${ORIGIN}/__sandbox.html`): FakeFrame {
  return {
    __v_skip: true,
    src,
    contentWindow: { postMessage: vi.fn() },
  }
}

/**
 * Installs a fake `window` exposing only what the store touches. `setTimeout`
 * delegates through `globalThis` so vitest fake timers apply to it.
 */
/**
 * Loads the real preview runtime store through the pinia mock.
 */
async function loadStore() {
  vi.resetModules()
  vi.doMock('pinia', () => createPiniaStub())

  const mod = await import('../../../../histoire-app/src/app/stores/preview-runtime.js')
  return mod.usePreviewRuntimeStore()
}

/**
 * Delivers a preview reply to the store's message listener.
 *
 * @param frame - Frame the message pretends to come from.
 * @param data - Reply payload (the `__histoire` marker is added).
 */
function reply(frame: FakeFrame, data: Record<string, any>) {
  fakeWindow.dispatchMessage({
    source: frame.contentWindow,
    origin: ORIGIN,
    data: { __histoire: true, ...data },
  })
}

/** Reads the payload of the nth outbound postMessage call. */
function sentPayload(frame: FakeFrame, index: number) {
  return frame.contentWindow.postMessage.mock.calls[index][0]
}

describe('preview runtime store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fakeWindow = installFakeWindow()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    fakeWindow.uninstall()
  })

  it('resolves a collection with the definitions and the preview-side error', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    const promise = store.collectCurrentFrameTests('story-a:variant-a')
    const request = sentPayload(frame, 0)
    expect(request.type).toBe(COLLECT_TESTS)
    expect(request.variantKey).toBe('story-a:variant-a')

    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: request.requestId,
      variantKey: 'story-a:variant-a',
      definitions: [{ id: '0', mode: 'run', name: 'a' }],
      error: { message: 'boom' },
    })

    await expect(promise).resolves.toEqual({
      definitions: [{ id: '0', mode: 'run', name: 'a' }],
      error: { message: 'boom' },
    })
  })

  it('marks its outbound requests so the preview runtime accepts them', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    void store.collectCurrentFrameTests('story-a:variant-a').catch(() => {})
    void store.runCurrentFrameTests('story-a:variant-a').catch(() => {})

    // The preview runtime drops every inbound message without the marker; these
    // two used to be the only unmarked traffic in the protocol, kept working by
    // a per-type exemption on the receiving side.
    expect(sentPayload(frame, 0)).toMatchObject({ __histoire: true, type: COLLECT_TESTS })
    store.notifyFrameNavigating()
    await flushMicrotasks()
    expect(sentPayload(frame, 1)).toMatchObject({ __histoire: true, type: RUN_TESTS })
  })

  it('re-issues the request instead of stalling when the iframe answers about another variant', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    const promise = store.collectCurrentFrameTests('story-a:variant-b')

    // The iframe had not applied the new selection yet, so it collected (and
    // truthfully tagged) the previous variant.
    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: sentPayload(frame, 0).requestId,
      variantKey: 'story-a:variant-a',
      definitions: [{ id: '0', mode: 'run', name: 'stale' }],
    })
    await flushMicrotasks()

    // Re-issued immediately (no clock advance), with a fresh request id.
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2)
    expect(sentPayload(frame, 1).requestId).not.toBe(sentPayload(frame, 0).requestId)

    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: sentPayload(frame, 1).requestId,
      variantKey: 'story-a:variant-b',
      definitions: [{ id: '0', mode: 'run', name: 'fresh' }],
    })

    await expect(promise).resolves.toEqual({
      definitions: [{ id: '0', mode: 'run', name: 'fresh' }],
      error: null,
    })
    // Nothing is left waiting on the 15s reply timeout.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with a variant mismatch error once the retries are exhausted', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    // Capture the outcome up front so the rejection is never unhandled while
    // the loop below drives the retries.
    const outcome = store.runCurrentFrameTests('story-a:variant-b').then(() => null, (error: Error) => error)

    // Answer every attempt about the wrong variant.
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(attempt + 1)
      expect(sentPayload(frame, attempt).type).toBe(RUN_TESTS)
      reply(frame, {
        type: TEST_RESULT,
        runId: sentPayload(frame, attempt).runId,
        variantKey: 'story-a:variant-a',
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, tests: [] },
      })
      await flushMicrotasks()
    }

    expect((await outcome)?.message).toMatch(/story-a:variant-a[\s\S]*story-a:variant-b/)
    // Bounded: the store gives up instead of looping against a disagreeing iframe.
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts in-flight requests when the iframe navigates to another story', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    const collectPromise = store.collectCurrentFrameTests('story-a:variant-a')
    const runPromise = store.runCurrentFrameTests('story-a:variant-a')

    // The iframe element is reused across navigations (only `src` changes), so
    // `setFrame` never sees a swap — the components must announce it.
    store.notifyFrameNavigating()

    await expect(collectPromise).rejects.toThrow(/navigat/i)
    await expect(runPromise).rejects.toThrow(/navigat/i)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a navigation notice when nothing is in flight', async () => {
    const store = await loadStore()
    store.setFrame('grid', createFrame() as any)

    // The grid mounts with `immediate: true` on its sandboxUrl watcher.
    expect(() => store.notifyFrameNavigating()).not.toThrow()
  })

  it('aborts in-flight requests when the last iframe detaches or is replaced', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    const detached = store.collectCurrentFrameTests('story-a:variant-a')
    store.setFrame('single', null)
    await expect(detached).rejects.toThrow(/detached/)

    store.setFrame('single', frame as any)
    const replaced = store.collectCurrentFrameTests('story-a:variant-a')
    store.setFrame('single', createFrame() as any)
    await expect(replaced).rejects.toThrow(/reloaded/)
  })

  it('queues a concurrent request instead of throwing on a busy slot', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    const first = store.collectCurrentFrameTests('story-a:variant-a')
    const second = store.collectCurrentFrameTests('story-a:variant-b')
    await flushMicrotasks()

    // The second request waits for the first to settle rather than being
    // dropped (a dropped collect left the panel on stale definitions).
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(1)

    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: sentPayload(frame, 0).requestId,
      variantKey: 'story-a:variant-a',
      definitions: [],
    })
    await flushMicrotasks()

    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2)
    expect(sentPayload(frame, 1).variantKey).toBe('story-a:variant-b')

    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: sentPayload(frame, 1).requestId,
      variantKey: 'story-a:variant-b',
      definitions: [],
    })
    await Promise.all([first, second])
  })

  it('ignores replies from an untrusted frame or without the histoire marker', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    const outcome = store.collectCurrentFrameTests('story-a:variant-a').then(() => null, (error: Error) => error)
    const requestId = sentPayload(frame, 0).requestId
    const forged = {
      type: TEST_DEFINITIONS,
      requestId,
      variantKey: 'story-a:variant-a',
      definitions: [{ id: '0', mode: 'run', name: 'forged' }],
    }

    // Foreign window.
    fakeWindow.dispatchMessage({ source: { postMessage: vi.fn() }, origin: ORIGIN, data: { __histoire: true, ...forged } })
    // Foreign origin.
    fakeWindow.dispatchMessage({ source: frame.contentWindow, origin: 'http://evil.test', data: { __histoire: true, ...forged } })
    // Missing marker.
    fakeWindow.dispatchMessage({ source: frame.contentWindow, origin: ORIGIN, data: forged })
    await flushMicrotasks()

    // None of them settled the request — only the reply timeout does.
    await vi.advanceTimersByTimeAsync(15000)
    expect((await outcome)?.message).toMatch(/did not return collected tests in time/)
  })

  it('rejects immediately when no preview iframe is mounted', async () => {
    const store = await loadStore()

    // Nothing is hosting a preview (navigating between non-story routes): the
    // request must fail fast instead of waiting out the reply timeout.
    await expect(store.collectCurrentFrameTests('story-a:variant-a')).rejects.toThrow(/not ready/)
  })

  it('frees the slot after a reply timeout so the next request is posted', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    // The rejection handler is attached before the clock moves, so the timeout
    // does not surface as an unhandled rejection.
    const timedOut = expect(store.collectCurrentFrameTests('story-a:variant-a'))
      .rejects
      .toThrow(/did not return collected tests in time/)
    await vi.advanceTimersByTimeAsync(15000)
    await timedOut

    // A leaked slot would queue every later collect forever, leaving the panel
    // on stale definitions with nothing to retrigger it.
    const next = store.collectCurrentFrameTests('story-a:variant-a')
    await flushMicrotasks()
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2)

    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: sentPayload(frame, 1).requestId,
      variantKey: 'story-a:variant-a',
      definitions: [],
    })
    await expect(next).resolves.toEqual({ definitions: [], error: null })
  })

  it('keeps the run and collection slots independent', async () => {
    const store = await loadStore()
    const frame = createFrame()
    store.setFrame('single', frame as any)

    // A hung run must not queue a collection behind it: the panel recollects on
    // every preview-ready transition, including while a run is still going.
    const run = store.runCurrentFrameTests('story-a:variant-a')
    const collection = store.collectCurrentFrameTests('story-a:variant-a')
    await flushMicrotasks()

    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2)
    expect(sentPayload(frame, 0).type).toBe(RUN_TESTS)
    expect(sentPayload(frame, 1).type).toBe(COLLECT_TESTS)

    reply(frame, {
      type: TEST_DEFINITIONS,
      requestId: sentPayload(frame, 1).requestId,
      variantKey: 'story-a:variant-a',
      definitions: [{ id: '0', mode: 'run', name: 'a' }],
    })
    await expect(collection).resolves.toEqual({
      definitions: [{ id: '0', mode: 'run', name: 'a' }],
      error: null,
    })

    reply(frame, {
      type: TEST_RESULT,
      runId: sentPayload(frame, 0).runId,
      variantKey: 'story-a:variant-a',
      summary: { total: 1, passed: 1, failed: 0, skipped: 0, tests: [] },
    })
    await expect(run).resolves.toMatchObject({ passed: 1 })
  })

  it('falls back to the host origin instead of a wildcard for an unusable frame src', async () => {
    const store = await loadStore()
    const frame = createFrame('http://[')
    store.setFrame('single', frame as any)

    void store.collectCurrentFrameTests('story-a:variant-a').catch(() => {})
    expect(frame.contentWindow.postMessage.mock.calls[0][1]).toBe(ORIGIN)

    // Free the slot so the next request is posted instead of queued.
    store.notifyFrameNavigating()
    await flushMicrotasks()

    const sameOrigin = createFrame()
    store.setFrame('grid', sameOrigin as any)
    store.setFrame('single', null)
    void store.collectCurrentFrameTests('story-a:variant-a').catch(() => {})
    expect(sameOrigin.contentWindow.postMessage.mock.calls[0][1]).toBe(ORIGIN)
  })
})
