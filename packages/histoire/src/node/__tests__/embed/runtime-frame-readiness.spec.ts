// @vitest-environment jsdom
import { RUNTIME_FAILED, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'

describe('runtime readiness retirement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class {
      /** Readiness tests publish frame messages directly, without layout callbacks. */
      observe = vi.fn()
      /** Teardown releases only this fixture's observer. */
      disconnect = vi.fn()
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(['docs', 'a:b'])('settles pending mount promptly and suppresses retired deadline for %s null selection', async (storyId) => {
    const fixture = await createRuntimeFrameFixture()
    let outcome: unknown = 'pending'
    void fixture.primary.ready.then(() => {
      outcome = 'ready'
    }, (error) => {
      outcome = error.code
    })
    try {
      await fixture.session.selection.select({ storyId, variantId: null })
      await vi.advanceTimersByTimeAsync(0)
      const immediateOutcome = outcome
      await vi.advanceTimersByTimeAsync(100)
      expect(fixture.session.getSnapshot().runtime.status).toBe('absent')
      expect(fixture.publications.map(runtime => runtime.status)).toEqual(['mounting', 'absent'])
      expect(immediateOutcome).toBe('RUNTIME_CHANGED')
      expect(fixture.container.querySelector('iframe')).toBeNull()
    }
    finally { await fixture.close() }
  })

  it('admits replacement after docs while ignoring retired readiness and failure', async () => {
    const fixture = await createRuntimeFrameFixture()
    const first = fixture.primary.ready.catch(error => error.code)
    const frame = fixture.container.querySelector('iframe')!
    const retiredDocument = new URL(frame.src).searchParams.get('documentId')
    try {
      await fixture.session.selection.select({ storyId: 'docs' })
      const selecting = fixture.session.selection.select({ storyId: 'a:b', variantId: 'c' })
      expect(new URL(frame.src).searchParams.get('documentId')).not.toBe(retiredDocument)
      publishFrameMessage(frame, RUNTIME_FAILED, retiredDocument)
      publishFrameMessage(frame, VARIANT_READY, retiredDocument)
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      publishFrameMessage(frame, VARIANT_READY)
      await selecting
      expect(await first).toBe('RUNTIME_CHANGED')
      await vi.advanceTimersByTimeAsync(100)
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
      expect(fixture.container.querySelectorAll('iframe')).toHaveLength(1)
      expect(fixture.publications.some(runtime => runtime.status === 'failed')).toBe(false)
    }
    finally { await fixture.close() }
  })
})
