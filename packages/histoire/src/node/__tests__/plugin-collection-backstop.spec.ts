import type { DevEventResult, DevEventTransport } from '../../../../histoire-app/src/app/util/dev-event-api.js'
import { expect, it, vi } from 'vitest'
import { createDevEventApi } from '../../../../histoire-app/src/app/util/dev-event-api.js'

it('times out only lost collection reply, retires progress, and allows correlated retry', async () => {
  // Transport is the external boundary. Real correlation, timers, cancellation,
  // and subscription cleanup execute without mocked application behavior.
  const requests: Parameters<DevEventTransport['send']>[0][] = []
  let reply: (value: DevEventResult) => void = () => {}
  let stream: (value: DevEventResult) => void = () => {}
  const api = createDevEventApi({ send: value => requests.push(value), onResult: (listener) => {
    reply = listener
  }, onProgress: (listener) => {
    stream = listener
  } })
  const progress: unknown[] = []
  try {
    const lost = api.sendEvent('collectStoryTests', {}, undefined, value => progress.push(value), { timeoutMs: 50 })
    let failure: unknown
    void lost.catch((error) => {
      failure = error
    })
    const request = requests[0]
    const running = api.sendEvent('runStoryTests', { storyId: 'other' })
    const other = requests[1]
    stream({ event: 'collectStoryTests', requestId: request.requestId, progress: 'healthy subset' })
    await vi.waitFor(() => expect(failure, 'Lost collection reply must hit its own backstop').toMatchObject({ code: 'TIMEOUT' }), { timeout: 1000 })
    expect(requests[2]).toEqual({ event: 'cancelStoryTests', requestId: request.requestId, payload: { requestId: request.requestId } })
    stream({ event: 'collectStoryTests', requestId: request.requestId, progress: 'late subset' })
    reply({ event: 'collectStoryTests', requestId: request.requestId, result: 'late result' })
    expect(progress).toEqual(['healthy subset'])
    reply({ event: 'runStoryTests', requestId: other.requestId, result: 'assertions completed' })
    await expect(running).resolves.toBe('assertions completed')
    const retry = api.sendEvent('collectStoryTests', { force: true }, undefined, undefined, { timeoutMs: 1000 })
    const replacement = requests[3]
    expect(replacement.requestId).not.toBe(request.requestId)
    reply({ event: 'collectStoryTests', requestId: replacement.requestId, result: 'fresh definitions' })
    await expect(retry).resolves.toBe('fresh definitions')
  }
  finally { api.close() }
})
