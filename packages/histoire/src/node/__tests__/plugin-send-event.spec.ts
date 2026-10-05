import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDevEventApi, DEV_EVENT_TIMEOUT } from '../../../../histoire-app/src/app/util/dev-event-api.js'

/**
 * Behavioral tests for the app-side dev plugin API `sendEvent`.
 *
 * The `import.meta.hot` wiring stays in `plugin.ts`; everything that can go
 * wrong — a reply crossing between two overlapping calls, a failure that must
 * reject instead of hanging, a result message lost on the wire — lives in
 * `createDevEventApi` and is driven here through a fake transport.
 */

/** Fake dev-server channel recording requests and replaying replies. */
function createChannel() {
  const requests: { event: string, payload?: any, requestId: string }[] = []
  let emit: (result: any) => void = () => {}

  return {
    requests,
    transport: {
      send: (payload: any) => {
        requests.push(payload)
      },
      onResult: (listener: (result: any) => void) => {
        emit = listener
      },
    },
    /** Delivers a `histoire:dev-event-result` message. */
    reply(result: Record<string, any>) {
      emit(result)
    },
  }
}

describe('createDevEventApi', () => {
  it('closes result subscription and rejects pending calls without leaving timers or sending again', async () => {
    const channel = createChannel()
    const off = vi.fn()
    const api = createDevEventApi({ ...channel.transport, onResult(listener) {
      channel.transport.onResult(listener)
      return off
    } })
    const pending = api.sendEvent('pending')
    const rejected = expect(pending).rejects.toThrow('Histoire dev event API closed.')
    api.close()
    api.close()
    await rejected
    expect(off).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    await expect(api.sendEvent('late')).rejects.toThrow('Histoire dev event API closed.')
    expect(channel.requests).toHaveLength(1)
  })
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the result of its own request', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    const promise = sendEvent('runStoryTests', { storyId: 'story-a' })

    expect(channel.requests).toHaveLength(1)
    expect(channel.requests[0]).toMatchObject({
      event: 'runStoryTests',
      payload: { storyId: 'story-a' },
    })

    channel.reply({
      event: 'runStoryTests',
      requestId: channel.requests[0].requestId,
      result: { passed: 3 },
    })

    await expect(promise).resolves.toEqual({ passed: 3 })
  })

  it('rejects with the reported error instead of waiting for a result', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    const promise = sendEvent('runStoryTests')
    channel.reply({
      event: 'runStoryTests',
      requestId: channel.requests[0].requestId,
      error: 'vitest exited with code 1',
    })

    await expect(promise).rejects.toThrow('vitest exited with code 1')
  })

  it('preserves a typed source retirement error from the server', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)
    const promise = sendEvent('runStoryTests')

    channel.reply({ event: 'runStoryTests', requestId: channel.requests[0].requestId, error: 'Test source owner changed', code: 'RUNTIME_CHANGED' })

    await expect(promise).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
  })

  it('keeps two overlapping calls of the same event from crossing results', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    const first = sendEvent('runStoryTests', { variantId: 'variant-a' })
    const second = sendEvent('runStoryTests', { variantId: 'variant-b' })

    const [firstRequest, secondRequest] = channel.requests
    expect(firstRequest.requestId).not.toBe(secondRequest.requestId)

    // The second run answers first: it must settle only its own promise.
    channel.reply({ event: 'runStoryTests', requestId: secondRequest.requestId, result: 'second' })
    await expect(second).resolves.toBe('second')

    channel.reply({ event: 'runStoryTests', requestId: firstRequest.requestId, result: 'first' })
    await expect(first).resolves.toBe('first')
  })

  it.each(['runStoryTests', 'collectStoryTests'])('cancels only its correlated %s request when its caller aborts', async (event) => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)
    const controller = new AbortController()
    const first = sendEvent(event, { storyId: 'first' }, controller.signal)
    const second = sendEvent(event, { storyId: 'second' })
    const [firstRequest, secondRequest] = channel.requests

    controller.abort()

    expect(channel.requests[2]).toEqual({
      event: 'cancelStoryTests',
      payload: { requestId: firstRequest.requestId },
      requestId: firstRequest.requestId,
    })
    await expect(first).rejects.toThrow('cancelled')
    channel.reply({ event, requestId: secondRequest.requestId, result: 'second' })
    await expect(second).resolves.toBe('second')
  })

  it('still settles on a reply carrying no request id', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    // Legacy plugin handlers reply without echoing the request id.
    const promise = sendEvent('customPluginEvent')
    channel.reply({ event: 'customPluginEvent', result: 'legacy' })

    await expect(promise).resolves.toBe('legacy')
  })

  it('prefixes request ids per client so two tabs cannot collide', () => {
    const firstTab = createChannel()
    const secondTab = createChannel()
    void createDevEventApi(firstTab.transport).sendEvent('runStoryTests')
    void createDevEventApi(secondTab.transport).sendEvent('runStoryTests')

    // Both are the first request of their client, so a bare counter would give
    // them the same id and a broadcast reply could settle the wrong tab.
    expect(firstTab.requests[0].requestId).not.toBe(secondTab.requests[0].requestId)
  })

  it('rejects when the result message never arrives', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    const promise = sendEvent('runStoryTests')
    let settled = false
    void promise.catch(() => {
      settled = true
    })

    // The node run has a 300s safety cap, so the backstop must outlast any
    // legitimate run rather than killing it.
    expect(DEV_EVENT_TIMEOUT).toBeGreaterThan(300_000)
    await vi.advanceTimersByTimeAsync(DEV_EVENT_TIMEOUT - 1)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toThrow(/timed out/)
  })

  it('clears the backstop once the promise settles', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    const promise = sendEvent('runStoryTests')
    channel.reply({ event: 'runStoryTests', requestId: channel.requests[0].requestId, result: 'done' })
    await expect(promise).resolves.toBe('done')

    // A leftover timer would keep the app awake for six minutes and then reject
    // an already-settled promise.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves on-prefixed hook events without waiting for a reply', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    // Plugin hooks (`onStoryOpened`…) are fire-and-forget: the dev server never
    // answers them, so waiting would always hit the backstop.
    await expect(sendEvent('onStoryOpened', { storyId: 'story-a' })).resolves.toBeUndefined()
    expect(channel.requests[0].event).toBe('onStoryOpened')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never delivers a result meant for another event', async () => {
    const channel = createChannel()
    const { sendEvent } = createDevEventApi(channel.transport)

    const promise = sendEvent('runStoryTests')
    let settled = false
    void promise.then(() => {
      settled = true
    }, () => {
      settled = true
    })

    channel.reply({ event: 'somethingElse', result: 'wrong' })
    await Promise.resolve()
    expect(settled).toBe(false)

    channel.reply({ event: 'runStoryTests', requestId: channel.requests[0].requestId, result: 'right' })
    await expect(promise).resolves.toBe('right')
  })
})
