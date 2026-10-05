// @vitest-environment jsdom
import { EVENT_SEND, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createInspectorEventCounter } from '../../../../../histoire-app/src/app/components/inspector/state.js'
import { logEvent } from '../../../../../histoire-app/src/app/util/events.js'
import { installRuntimeEventScope } from '../../../../../histoire-app/src/app/util/runtime-events.js'
import { previewHostMessaging } from '../../virtual/preview-runtime/host-messaging.js'
import { previewRuntimeService } from '../../virtual/preview-runtime/runtime-service.js'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('ResizeObserver', class {
    /** Geometry does not affect event ownership. */
    observe = vi.fn()
    /** Fixture releases observer when primary runtime retires. */
    disconnect = vi.fn()
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Execute real generated services; layout/channels stay outside event regression. */
function installGeneratedEventService(window: Record<string, any>, story: { value: { id: string } }) {
  // eslint-disable-next-line no-new-func -- generated preview setup is emitted source text
  return new Function('window', 'story', 'variant', 'initialSelection', 'histoireConfig', 'observeRuntimeLayout', 'installRuntimeHostChannels', 'installRuntimeEventScope', `
    ${previewHostMessaging()}
    ${previewRuntimeService()}
    return {
      close: closeRuntimeEvents,
      select(version) { previewSelectionVersion = version },
    }
  `)(window, story, { value: { id: 'c' } }, {}, {}, () => ({ close() {} }), () => ({ close() {} }), installRuntimeEventScope) as {
    /** Retire document-owned event publication. */
    close: () => void
    /** Simulate version accepted by separately covered PREVIEW_SYNC handler. */
    select: (version: number) => void
  }
}

it('publishes story logEvent through current runtime owner and updates unseen events', async () => {
  const fixture = await createRuntimeFrameFixture({ standalone: true, extraVariants: ['second'] })
  const frame = fixture.container.querySelector('iframe')!
  const host = window
  const cell = document.createElement('div')
  cell.setAttribute('data-histoire-runtime-content', '')
  cell.setAttribute('data-histoire-variant-id', 'c')
  const button = document.createElement('button')
  cell.append(button)
  document.body.append(cell)
  const messages: Record<string, any>[] = []
  const location = new URL(frame.src)
  const sandbox: Record<string, any> = {
    location,
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    frameElement: { ownerDocument: { defaultView: {
      postMessage(payload: Record<string, any>, origin: string) {
        messages.push(payload)
        host.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin, data: payload }))
      },
    } } },
  }
  // Cypress patches parent while loading its iframe; runtime's real host lookup
  // must still be used by public story callbacks, not only readiness messages.
  sandbox.parent = sandbox
  const counter = createInspectorEventCounter()
  vi.stubGlobal('window', sandbox)
  vi.stubGlobal('location', location)
  const runtime = installGeneratedEventService(sandbox, { value: { id: 'a:b' } })
  try {
    // Frame listener is attached to host before globals are replaced.
    vi.stubGlobal('window', host)
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    expect(counter.observe(fixture.session.getSnapshot(), false)).toBe(0)
    vi.stubGlobal('window', sandbox)
    let logged: Promise<void> | undefined
    button.addEventListener('click', () => logged = logEvent('My event', { a: 'Hello', b: 'World' }))
    button.click()
    await logged
    expect(fixture.session.getSnapshot().events.items).toHaveLength(1)
    expect(sandbox.postMessage).not.toHaveBeenCalled()
    expect(messages[0]).toMatchObject({ type: EVENT_SEND, selectionVersion: 0, documentId: location.searchParams.get('documentId'), storyId: 'a:b', variantId: 'c' })
    expect(fixture.session.getSnapshot().events.items[0].payload).toEqual({ name: 'My event', argument: { a: 'Hello', b: 'World' } })
    expect(counter.observe(fixture.session.getSnapshot(), false)).toBe(1)
    expect(counter.observe(fixture.session.getSnapshot(), true)).toBe(0)

    vi.stubGlobal('window', host)
    const selection = fixture.session.selection.select({ storyId: 'a:b', variantId: 'second' })
    publishFrameMessage(frame, VARIANT_READY, undefined, { variantId: 'second', selectionVersion: 1 })
    await selection
    expect(counter.observe(fixture.session.getSnapshot(), false)).toBe(0)
    vi.stubGlobal('window', sandbox)
    await logEvent('stale callback', {}, { storyId: 'a:b', variantId: 'second' })
    expect(fixture.session.getSnapshot().events.items).toHaveLength(0)
    runtime.select(1)
    await logEvent('current callback', 2, { storyId: 'a:b', variantId: 'second' })
    expect(messages.at(-1)).toMatchObject({ selectionVersion: 1, variantId: 'second' })
    expect(fixture.session.getSnapshot().events.items).toHaveLength(1)
    expect(counter.observe(fixture.session.getSnapshot(), false)).toBe(1)
  }
  finally {
    runtime.close()
    vi.stubGlobal('window', host)
    cell.remove()
    await fixture.close()
  }
})
