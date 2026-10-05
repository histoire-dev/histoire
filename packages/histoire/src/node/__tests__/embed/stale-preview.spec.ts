// @vitest-environment jsdom
import { EVENT_SEND, HOST_CHANNEL_MESSAGE, RUNTIME_RESULT, STATE_SYNC, TEST_RESULT, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'

describe('standalone last good preview retention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class {
      /** Tests own publication delivery without relying on jsdom layout. */
      observe = vi.fn()
      /** Teardown releases only this fixture's observation. */
      disconnect = vi.fn()
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(['storyId', 'relativePath'] as const)('retains only matching %s failures, blocks stale traffic, and recovers through fresh document', async (identity) => {
    const fixture = await createRuntimeFrameFixture({ standalone: true })
    const frame = fixture.container.querySelector('iframe')!
    const originalUrl = frame.src
    fixture.source.descriptor.catalog.stories[0].relativePath = 'Button.story.vue'
    // Publish this real metadata before readiness so adapter captures file identity.
    fixture.source.emitCatalog()
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      const stories = [...fixture.source.descriptor.catalog.stories]
      fixture.source.descriptor.catalog = { stories: stories.slice(1), tree: [], diagnostics: [{ code: 'COLLECTION_FAILED', severity: 'error', message: 'Invalid story', [identity]: identity === 'storyId' ? 'a:b' : 'Button.story.vue' }] }
      fixture.source.descriptor.revision = 'failed-collection'
      fixture.source.emitCatalog()
      await vi.advanceTimersByTimeAsync(0)
      expect(fixture.session.getSnapshot()).toMatchObject({ selection: null, runtime: { status: 'stale', runtimeId: null }, state: null })
      expect(fixture.container.querySelector('iframe')).toBe(frame)
      expect(frame.src).toBe(originalUrl)
      expect(frame.hasAttribute('inert')).toBe(true)
      const published = fixture.messages.length
      for (const type of [VARIANT_READY, STATE_SYNC, RUNTIME_RESULT, TEST_RESULT, HOST_CHANNEL_MESSAGE, EVENT_SEND]) {
        publishFrameMessage(frame, type, undefined, { state: { count: 900 }, result: {}, summary: {}, event: { forged: true }, channel: { name: 'factory', type: 'application', data: null } })
      }
      expect(fixture.messages).toHaveLength(published)
      await expect(fixture.session.state.get()).rejects.toMatchObject({ code: 'SELECTION_REQUIRED' })
      fixture.source.descriptor.catalog = { stories, tree: [], diagnostics: [] }
      fixture.source.descriptor.revision = 'recovered-collection'
      fixture.source.emitCatalog()
      const selecting = fixture.session.selection.select({ storyId: 'a:b', variantId: 'c' })
      expect(frame.src).not.toBe(originalUrl)
      expect(frame.hasAttribute('inert')).toBe(false)
      publishFrameMessage(frame, VARIANT_READY, new URL(originalUrl).searchParams.get('documentId'))
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      publishFrameMessage(frame, VARIANT_READY)
      await selecting
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
    }
    finally { await fixture.close() }
  })

  it('retains failed collection during a pending test while cancelling its captured operation', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true })
    const frame = fixture.container.querySelector('iframe')!
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      const pending = fixture.session.tests.run({ mode: 'preview' }).catch(error => error.code)
      await vi.advanceTimersByTimeAsync(0)
      fixture.source.descriptor.catalog = { stories: [], tree: [], diagnostics: [{ code: 'COLLECTION_FAILED', storyId: 'a:b', severity: 'error', message: 'Invalid story' }] }
      fixture.source.descriptor.revision = 'failure-during-test'
      fixture.source.emitCatalog()
      await vi.advanceTimersByTimeAsync(0)
      expect(await pending).toBe('STALE_REVISION')
      expect(fixture.container.querySelector('iframe')).toBe(frame)
      expect(frame.hasAttribute('inert')).toBe(true)
      expect(fixture.session.getSnapshot().runtime).toMatchObject({ status: 'stale', runtimeId: null })
    }
    finally { await fixture.close() }
  })

  it.each([false, true])('removes deleted stories with unrelated collection diagnostics for standalone=%s', async (standalone) => {
    const fixture = await createRuntimeFrameFixture({ standalone })
    const frame = fixture.container.querySelector('iframe')!
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      fixture.source.descriptor.catalog = { stories: [], tree: [], diagnostics: [{ code: 'COLLECTION_FAILED', storyId: standalone ? 'other-story' : 'a:b', severity: 'error', message: 'Other failure' }] }
      fixture.source.descriptor.revision = 'deleted'
      fixture.source.emitCatalog()
      expect(fixture.container.querySelector('iframe')).toBeNull()
      expect(fixture.session.getSnapshot().runtime.status).toBe('absent')
    }
    finally { await fixture.close() }
  })

  it('removes retained content when user explicitly selects docs despite matching collection failure', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true })
    const frame = fixture.container.querySelector('iframe')!
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      fixture.source.descriptor.catalog = { stories: fixture.source.descriptor.catalog.stories.slice(1), tree: [], diagnostics: [{ code: 'COLLECTION_FAILED', storyId: 'a:b', severity: 'error', message: 'Invalid story' }] }
      fixture.source.descriptor.revision = 'broken'
      fixture.source.emitCatalog()
      expect(fixture.container.querySelector('iframe')).toBe(frame)
      await fixture.session.selection.select({ storyId: 'docs' })
      expect(fixture.container.querySelector('iframe')).toBeNull()
      expect(fixture.session.getSnapshot().runtime.status).toBe('absent')
    }
    finally { await fixture.close() }
  })

  it('never retains pending content without a previously ready actor', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true })
    const ready = fixture.primary.ready.catch(error => error.code)
    try {
      fixture.source.descriptor.catalog = { stories: [], tree: [], diagnostics: [{ code: 'COLLECTION_FAILED', storyId: 'a:b', severity: 'error', message: 'Invalid story' }] }
      fixture.source.descriptor.revision = 'broken-before-ready'
      fixture.source.emitCatalog()
      expect(await ready).toBe('STALE_REVISION')
      expect(fixture.container.querySelector('iframe')).toBeNull()
      expect(fixture.session.getSnapshot().runtime.status).toBe('absent')
    }
    finally { await fixture.close() }
  })

  it.each([false, true])('preserves sanctioned matrix query only when standalone=%s', async (standalone) => {
    const fixture = await createRuntimeFrameFixture({ standalone, sourceBase: 'http://localhost/book/?matrix=true&documentId=foreign&unexpected=foreign' })
    try {
      const url = new URL(fixture.container.querySelector('iframe')!.src)
      expect(url.searchParams.get('matrix')).toBe(standalone ? 'true' : null)
      expect(url.searchParams.get('unexpected')).toBeNull()
      expect(url.searchParams.get('documentId')).not.toBe('foreign')
    }
    finally { await fixture.close() }
  })
})
