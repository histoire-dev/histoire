// @vitest-environment jsdom
import type { UiMcpOperationInfo, UiMcpSnapshot } from '@histoire/shared'
import { getHistoireTargetKey } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { getMcpCursor } from '../../../../histoire-app/src/app/components/canvas/agent-cursor.js'
import { createCanvasFrames } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'

/** Compose real SDK readiness and canvas registry; only browser layout needs a DOM measurement port. */
async function cursorFixture() {
  const source = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, source.adapters)
  await session.connect()
  const target = { storyId: 'a:b', variantId: 'c' }
  await session.selection.select(target)
  await session.mount({} as HTMLElement, { surface: 'preview' }).ready
  const canvas = createCanvasStore()
  canvas.setGeometry({ width: 800, height: 600 }, { x: 0, y: 0, width: 720, height: 640 })
  canvas.setZoom(0.5)
  canvas.panOffset = { x: 20, y: 40 }
  const frames = createCanvasFrames(canvas)
  const id = getHistoireTargetKey(target)
  const iframe = document.createElement('iframe')
  iframe.src = new URL('/__sandbox.html?documentId=document-1', window.location.href).href
  document.body.append(iframe)
  const bounds = { x: 100, y: 200, width: 800, height: 600 }
  const unregister = frames.registerFrame({ id, ...target, rect: { x: 80, y: 120, width: 720, height: 640 }, iframe, documentId: 'document-1', session })
  vi.spyOn(iframe, 'getBoundingClientRect').mockImplementation(() => {
    const rect = frames.getFrame(id)!.rect
    return new DOMRect(bounds.x + rect.x * canvas.effectiveZoom + canvas.panOffset.x, bounds.y + rect.y * canvas.effectiveZoom + canvas.panOffset.y, rect.width * canvas.effectiveZoom, rect.height * canvas.effectiveZoom)
  })
  canvas.selectedFrame = id
  const operation: UiMcpOperationInfo = { id: 'call', clientId: 'client', tool: 'histoire_run_tests', state: 'running', startedAt: '', target }
  const activity = { status: 'enabled' as UiMcpSnapshot['status'], follow: true, current: operation }
  return { source, session, canvas, frames, iframe, bounds, activity, id, unregister,
    /** Read current projections rather than retaining a pre-navigation snapshot. */
    resolve() { return getMcpCursor({ activity, snapshot: session.getSnapshot(), canvas, frames, bounds }) },
    /** Each fixture releases only its own native frame and SDK session. */
    async close() {
      iframe.remove()
      await session.dispose()
    } }
}

describe('mCP canvas cursor target ownership', () => {
  it('requires Follow and a running exact selected story and variant', async () => {
    const fixture = await cursorFixture()
    try {
      expect(fixture.resolve()).toEqual({ x: 68, y: 108 })
      for (const status of ['disabled', 'unavailable'] as const) {
        fixture.activity.status = status
        expect(fixture.resolve()).toBeNull()
      }
      fixture.activity.status = 'enabled'
      fixture.activity.follow = false
      expect(fixture.resolve()).toBeNull()
      fixture.activity.follow = true
      for (const state of ['queued', 'done', 'failed', 'cancelled'] as const) {
        fixture.activity.current = { ...fixture.activity.current, state }
        expect(fixture.resolve()).toBeNull()
      }
      fixture.activity.current = { ...fixture.activity.current, state: 'running', target: undefined }
      expect(fixture.resolve()).toBeNull()
      fixture.activity.current.target = { storyId: 'a:b' }
      expect(fixture.resolve()).toBeNull()
      fixture.activity.current.target = { storyId: 'other', variantId: 'c' }
      expect(fixture.resolve()).toBeNull()
      fixture.activity.current.target = { storyId: 'a:b', variantId: 'other' }
      expect(fixture.resolve()).toBeNull()
      fixture.activity.current.target = { storyId: 'a:b', variantId: 'c' }
      await fixture.session.selection.select({ storyId: 'a:b', variantId: 'other' })
      expect(fixture.resolve()).toBeNull()
    }
    finally { await fixture.close() }
  })

  it('rejects matrix override cells and missing or mismatched registered documents', async () => {
    const fixture = await cursorFixture()
    try {
      const frame = fixture.frames.getFrame(fixture.id)!
      fixture.frames.registerFrame({ ...frame, id: 'matrix-cell' })
      fixture.canvas.selectedFrame = 'matrix-cell'
      expect(fixture.resolve()).toBeNull()
      fixture.canvas.selectedFrame = fixture.id
      frame.documentId = 'retired-document'
      expect(fixture.resolve()).toBeNull()
      frame.documentId = 'document-1'
      fixture.iframe.src = new URL('/__sandbox.html?documentId=replacement', window.location.href).href
      expect(fixture.resolve()).toBeNull()
      fixture.iframe.src = 'https://foreign.test/__sandbox.html?documentId=document-1'
      expect(fixture.resolve()).toBeNull()
      fixture.iframe.src = new URL('/__sandbox.html?documentId=document-1', window.location.href).href
      frame.iframe = null
      expect(fixture.resolve()).toBeNull()
      frame.iframe = fixture.iframe
      fixture.unregister()
      expect(fixture.resolve()).toBeNull()
    }
    finally { await fixture.close() }
  })

  it('revokes stale runtime and source claims until exact replacement document becomes ready', async () => {
    const fixture = await cursorFixture()
    try {
      fixture.source.reload()
      expect(fixture.resolve()).toBeNull()
      fixture.source.ready()
      expect(fixture.resolve()).toBeNull()
      fixture.frames.getFrame(fixture.id)!.documentId = 'document-2'
      fixture.iframe.src = new URL('/__sandbox.html?documentId=document-2', window.location.href).href
      expect(fixture.resolve()).toEqual({ x: 68, y: 108 })
      fixture.source.emitDisconnect()
      expect(fixture.resolve()).toBeNull()
    }
    finally { await fixture.close() }
  })

  it('projects frame CSS anchor through live pan, zoom and geometry without clamping off-canvas claims', async () => {
    const fixture = await cursorFixture()
    try {
      fixture.canvas.panBy({ x: 30, y: -10 })
      expect(fixture.resolve()).toEqual({ x: 98, y: 98 })
      fixture.canvas.setZoom(2, { x: 0, y: 0 })
      expect(fixture.resolve()).toEqual({ x: 392, y: 392 })
      fixture.frames.getFrame(fixture.id)!.rect = { x: 100, y: 140, width: 720, height: 640 }
      expect(fixture.resolve()).toEqual({ x: 432, y: 432 })
      fixture.bounds.width = 400
      expect(fixture.resolve()).toBeNull()
      fixture.bounds.width = 800
      fixture.canvas.panBy({ x: -500, y: 0 })
      expect(fixture.resolve()).toBeNull()
    }
    finally { await fixture.close() }
  })
})
