// @vitest-environment jsdom
import type { CanvasFrameRegistration } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMeasureOwner } from '../../../../histoire-app/src/app/components/canvas/measure-owner.js'
import { createRuntimeFrameFixture, publishFrameMessage } from './utils/embed/runtime-frame.js'

/** Real runtime/session fixture supplies document identity rather than host mirror guesses. */
async function readyFrame() {
  const fixture = await createRuntimeFrameFixture({ standalone: true, runtimeRevision: '1'.repeat(64), sourceBase: new URL('/book/', window.location.href).href })
  const iframe = fixture.container.querySelector('iframe')!
  publishFrameMessage(iframe, VARIANT_READY)
  await fixture.primary.ready
  const frame: CanvasFrameRegistration = { id: 'frame', storyId: 'a:b', variantId: 'c', rect: { x: 0, y: 0, width: 720, height: 640 }, iframe, documentId: new URL(iframe.src).searchParams.get('documentId'), session: fixture.session }
  return { ...fixture, frame }
}

describe('measure preview owner', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', class {
    /** Geometry is tested separately; this fixture owns only runtime lifetime. */
    observe = vi.fn()
    /** Runtime teardown releases observer. */
    disconnect = vi.fn()
  }))
  afterEach(() => vi.unstubAllGlobals())

  it('requires enabled same-origin exact ready document and tuple', async () => {
    const fixture = await readyFrame()
    try {
      const snapshot = fixture.session.getSnapshot()
      expect(getMeasureOwner(fixture.frame, snapshot, true)).toMatchObject({ frameId: 'frame', storyId: 'a:b', variantId: 'c', documentId: snapshot.runtime.runtimeId })
      expect(getMeasureOwner(fixture.frame, snapshot, false)).toBeNull()
      expect(getMeasureOwner({ ...fixture.frame, documentId: 'old' }, snapshot, true)).toBeNull()
      expect(getMeasureOwner({ ...fixture.frame, variantId: 'other' }, snapshot, true)).toBeNull()
      expect(getMeasureOwner({ ...fixture.frame, storyId: 'other' }, snapshot, true)).toBeNull()
      fixture.frame.iframe!.src = 'https://foreign.test/__sandbox.html'
      expect(getMeasureOwner(fixture.frame, snapshot, true)).toBeNull()
    }
    finally { await fixture.close() }
  })

  it('changes measurement generation on source revision even when physical preview survives', async () => {
    const fixture = await readyFrame()
    try {
      const initial = getMeasureOwner(fixture.frame, fixture.session.getSnapshot(), true)!
      fixture.source.descriptor.revision = 'revision-2'
      fixture.source.emitCatalog()
      const current = getMeasureOwner(fixture.frame, fixture.session.getSnapshot(), true)!
      expect(current.documentId).toBe(initial.documentId)
      expect(current.generation).not.toBe(initial.generation)
    }
    finally { await fixture.close() }
  })

  it('revokes measurement during physical reload despite unchanged iframe and document ID', async () => {
    const fixture = await readyFrame()
    try {
      const iframe = fixture.frame.iframe!
      iframe.dispatchEvent(new Event('load'))
      expect(getMeasureOwner(fixture.frame, fixture.session.getSnapshot(), true)).not.toBeNull()
      iframe.dispatchEvent(new Event('load'))
      expect(getMeasureOwner(fixture.frame, fixture.session.getSnapshot(), true)).toBeNull()
      publishFrameMessage(iframe, VARIANT_READY, undefined, { selectionVersion: 1 })
      expect(getMeasureOwner(fixture.frame, fixture.session.getSnapshot(), true)).not.toBeNull()
    }
    finally { await fixture.close() }
  })
})
