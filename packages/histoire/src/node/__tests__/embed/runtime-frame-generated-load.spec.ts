// @vitest-environment jsdom
import { PREVIEW_SYNC } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'
import { createPreviewRuntimeApp } from '../utils/preview-runtime-app.js'

describe('sdk mount with generated framework runtime load', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      /** Layout does not change document lifecycle. */
      observe() {}
      /** Adapter owns observer cleanup. */
      disconnect() {}
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps initial mount promise and restores physical reload through actual generated readiness', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true })
    const frame = fixture.container.querySelector('iframe')!
    const runtime = createPreviewRuntimeApp({
      storyId: 'a:b',
      variantId: 'c',
      documentId: new URL(frame.src).searchParams.get('documentId')!,
      onMessage: message => publishFrameMessage(frame, message.type, message.documentId, message),
    })
    const restored: Promise<void>[] = []
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message) => {
      if (message.type === PREVIEW_SYNC) restored.push(runtime.select(message.variantId, message.selectionVersion))
    })
    try {
      frame.dispatchEvent(new Event('load'))
      await runtime.frames()
      await fixture.primary.ready
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
      expect(restored).toHaveLength(0)
      frame.dispatchEvent(new Event('load'))
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      await runtime.frames()
      await Promise.all(restored)
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
      expect(restored).toHaveLength(1)
    }
    finally {
      runtime.close()
      await fixture.close()
    }
  })
})
