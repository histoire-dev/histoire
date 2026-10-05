// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createDomEnv } from '../dom/env.js'

it('releases window timers and document before restoring globals, once', async () => {
  const nativeDelay = globalThis.setTimeout
  const env = createDomEnv()
  const document = globalThis.document
  const tick = vi.fn()
  const cancel = env.window.clearInterval
  const timer = env.window.setInterval(tick, 5)
  try {
    await new Promise(resolve => nativeDelay(resolve, 30))
    expect(tick).toHaveBeenCalled()
    env.destroy()
    const count = tick.mock.calls.length
    await new Promise(resolve => nativeDelay(resolve, 30))
    expect(tick).toHaveBeenCalledTimes(count)
    expect(document.body?.childNodes.length ?? 0).toBe(0)
    const next = createDomEnv()
    try {
      env.destroy()
      expect(globalThis.document).toBe(next.window.document)
    }
    finally { next.destroy() }
  }
  finally {
    cancel(timer)
    env.destroy()
  }
})

it('keeps native BroadcastChannel delivery usable after installing jsdom globals', async () => {
  if (typeof BroadcastChannel !== 'function') return
  const nativeEvent = Event
  const nativeMessageEvent = MessageEvent
  const env = createDomEnv()
  expect(Event).toBe(nativeEvent)
  expect(MessageEvent).toBe(nativeMessageEvent)
  const name = `dom-env-${crypto.randomUUID()}`
  const sender = new BroadcastChannel(name)
  const receiver = new BroadcastChannel(name)
  try {
    const received = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('BroadcastChannel message timed out')), 1_000)
      receiver.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(event.data)
      }
    })
    sender.postMessage('received')
    await expect(received).resolves.toBe('received')
  }
  finally {
    sender.close()
    receiver.close()
    env.destroy()
  }
})
