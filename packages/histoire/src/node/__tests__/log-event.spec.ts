import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENT_SEND } from '../../../../histoire-app/src/app/util/const.js'
import { FAKE_ORIGIN, installFakeWindow } from './utils/fake-window.js'

/**
 * Behavioral tests for `logEvent`, the public `histoire/client` API stories
 * call to push an entry into the Events panel.
 *
 * Inside the preview sandbox the entry has to cross the iframe boundary, and
 * the host drops any frame message that does not carry the `__histoire` marker
 * — so fallback message shape is asserted here. Real runtime/SDK acceptance is
 * exercised by `embed/runtime-frame-events.spec.ts` and SDK `mount-events.spec.ts`.
 */

const SANDBOX_HREF = `${FAKE_ORIGIN}/__sandbox.html?storyId=story-a&variantId=variant-a`

let fakeWindow: ReturnType<typeof installFakeWindow>

/**
 * Loads `logEvent` with a fake sandbox/host document installed.
 *
 * @param href Document URL; `__sandbox` in it selects the iframe branch.
 */
async function loadLogEvent(href: string) {
  vi.resetModules()
  fakeWindow = installFakeWindow({ href })

  const { logEvent } = await import('../../../../histoire-app/src/app/util/events.js')
  return logEvent
}

describe('logEvent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // `cleanEventPayload` tests values against these DOM constructors; they do not
    // exist in the `node` environment this package runs in.
    ;(globalThis as any).Node = class Node {}
    ;(globalThis as any).Window = class Window {}
  })

  afterEach(() => {
    fakeWindow?.uninstall()
    vi.restoreAllMocks()
    vi.resetModules()
    delete (globalThis as any).Node
    delete (globalThis as any).Window
  })

  it('posts same-origin marked fallback event', async () => {
    const logEvent = await loadLogEvent(SANDBOX_HREF)

    await logEvent('my-event', { detail: 'payload' })

    expect(fakeWindow.parentMessages).toHaveLength(1)
    const [{ payload, targetOrigin }] = fakeWindow.parentMessages
    expect(payload).toEqual({
      __histoire: true,
      type: EVENT_SEND,
      event: {
        name: 'my-event',
        argument: { detail: 'payload' },
      },
    })

    // Never '*': the sandbox is same-origin with the host by construction, and
    // a wildcard would leak the event payload to any page embedding it.
    expect(targetOrigin).toBe(FAKE_ORIGIN)
  })

  it('flattens non-cloneable event members so the message survives structured clone', async () => {
    const logEvent = await loadLogEvent(SANDBOX_HREF)

    // A DOM event exposes its members as enumerable accessors on the prototype
    // (WebIDL), which plain `JSON.stringify` would drop entirely, and
    // `target`/`view` point at objects structured clone cannot copy.
    class FakeDomEvent {
      target = new (globalThis as any).Node()
      view = new (globalThis as any).Window()
    }
    Object.defineProperty(FakeDomEvent.prototype, 'type', {
      get: () => 'click',
      enumerable: true,
    })

    await logEvent('Click', new FakeDomEvent())

    expect(fakeWindow.parentMessages[0].payload.event.argument).toEqual({
      target: 'Node',
      view: 'Window',
      type: 'click',
    })
    // Proves the payload is plain data (a live DOM node would throw here).
    expect(() => structuredClone(fakeWindow.parentMessages[0].payload)).not.toThrow()
  })

  it('writes straight to the events store outside the sandbox', async () => {
    const logEvent = await loadLogEvent(`${FAKE_ORIGIN}/story/story-a`)

    const { createPinia, setActivePinia } = await import('pinia')
    const { useEventsStore } = await import('../../../../histoire-app/src/app/stores/events.js')
    const pinia = createPinia()
    setActivePinia(pinia)

    await logEvent('my-event', { detail: 'payload', callback: () => {} })

    expect(fakeWindow.parentMessages).toHaveLength(0)
    expect(useEventsStore().events).toEqual([{
      name: 'my-event',
      argument: { detail: 'payload' },
    }])
    expect(useEventsStore().unseen).toBe(1)
    setActivePinia(undefined)
  })

  it('keeps host histories independent across Pinia owners and resets explicitly', async () => {
    const logEvent = await loadLogEvent(`${FAKE_ORIGIN}/story/story-a`)
    const { createPinia, setActivePinia } = await import('pinia')
    const { useEventsStore } = await import('../../../../histoire-app/src/app/stores/events.js')
    const first = createPinia()
    const second = createPinia()
    setActivePinia(first)
    await logEvent('first', 1)
    setActivePinia(second)
    await logEvent('second', 2)

    expect(useEventsStore(first).events).toEqual([{ name: 'first', argument: 1 }])
    expect(useEventsStore(second).events).toEqual([{ name: 'second', argument: 2 }])
    useEventsStore(first).reset()
    expect(useEventsStore(first).events).toEqual([])
    expect(useEventsStore(first).unseen).toBe(0)
    expect(useEventsStore(second).unseen).toBe(1)
    setActivePinia(undefined)
  })
})
