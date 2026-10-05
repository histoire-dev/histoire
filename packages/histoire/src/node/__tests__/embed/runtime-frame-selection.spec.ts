// @vitest-environment jsdom
import { PREVIEW_SYNC, STATE_SYNC, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'

describe('standalone story document selection', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      /** Geometry is outside selection lifecycle coverage. */
      observe = vi.fn()
      /** Fixture releases its observer on controller disposal. */
      disconnect = vi.fn()
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([false, true])('first iframe load preserves initial SDK mount, including ready bootstrap: %s', async (readyBeforeLoad) => {
    const fixture = await createRuntimeFrameFixture({ standalone: true })
    const frame = fixture.container.querySelector('iframe')!
    try {
      if (readyBeforeLoad) {
        publishFrameMessage(frame, VARIANT_READY)
        await fixture.primary.ready
      }
      frame.dispatchEvent(new Event('load'))
      publishFrameMessage(frame, VARIANT_READY)
      await fixture.primary.ready
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
    }
    finally { await fixture.close() }
  })

  it('joins current pending selection across retained document reload', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true, extraVariants: ['second'] })
    const frame = fixture.container.querySelector('iframe')!
    try {
      frame.dispatchEvent(new Event('load'))
      publishFrameMessage(frame, VARIANT_READY)
      await fixture.primary.ready
      const second = fixture.session.selection.select({ storyId: 'a:b', variantId: 'second' })
      frame.dispatchEvent(new Event('load'))
      publishFrameMessage(frame, VARIANT_READY, undefined, { variantId: 'second', selectionVersion: 2 })
      await second
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
    }
    finally { await fixture.close() }
  })

  it('restores superseding selection when first document load finishes before bootstrap readiness', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true, extraVariants: ['second'] })
    const frame = fixture.container.querySelector('iframe')!
    const initial = fixture.primary.ready.catch(error => error.code)
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
    try {
      const second = fixture.session.selection.select({ storyId: 'a:b', variantId: 'second' })
      frame.dispatchEvent(new Event('load'))
      expect(post.mock.calls.findLast(([message]) => message.type === PREVIEW_SYNC)?.[0]).toMatchObject({ variantId: 'second', selectionVersion: 2 })
      publishFrameMessage(frame, VARIANT_READY)
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      publishFrameMessage(frame, VARIANT_READY, undefined, { variantId: 'second', selectionVersion: 2 })
      await second
      expect(await initial).toBe('RUNTIME_CHANGED')
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
    }
    finally { await fixture.close() }
  })

  it('retains source-owned variant state and awaits current actor when returning to a variant', async () => {
    const fixture = await createRuntimeFrameFixture({ standalone: true, extraVariants: ['second'] })
    const frame = fixture.container.querySelector('iframe')!
    const src = frame.src
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
    try {
      publishFrameMessage(frame, STATE_SYNC, undefined, { state: { text: 'Edited first' }, selectionVersion: 0 })
      publishFrameMessage(frame, VARIANT_READY, undefined, { selectionVersion: 0 })
      await fixture.primary.ready
      expect(fixture.session.getSnapshot().state?.value.text).toBe('Edited first')
      const pendingEdit = fixture.session.state.patch({ text: 'Unacknowledged edit' }).catch(error => error.code)
      await Promise.resolve()
      const second = fixture.session.selection.select({ storyId: 'a:b', variantId: 'second' })
      expect(await pendingEdit).toBe('RUNTIME_CHANGED')
      expect(frame.src).toBe(src)
      expect(post.mock.calls.findLast(([message]) => message.type === PREVIEW_SYNC)?.[0]).toMatchObject({ storyId: 'a:b', variantId: 'second', selectionVersion: 1 })
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      publishFrameMessage(frame, STATE_SYNC, undefined, { variantId: 'second', state: { text: 'Second default' }, selectionVersion: 1 })
      publishFrameMessage(frame, VARIANT_READY, undefined, { variantId: 'second', selectionVersion: 1 })
      await second
      expect(fixture.session.getSnapshot().state?.value.text).toBe('Second default')
      const first = fixture.session.selection.select({ storyId: 'a:b', variantId: 'c' })
      publishFrameMessage(frame, VARIANT_READY, undefined, { selectionVersion: 0 })
      publishFrameMessage(frame, STATE_SYNC, undefined, { state: { text: 'Stale first' }, selectionVersion: 0 })
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      expect(fixture.session.getSnapshot().state).toBeNull()
      publishFrameMessage(frame, STATE_SYNC, undefined, { state: { text: 'Edited first' }, selectionVersion: 2 })
      publishFrameMessage(frame, VARIANT_READY, undefined, { selectionVersion: 2 })
      await first
      expect(frame.src).toBe(src)
      expect(fixture.session.getSnapshot().state?.value.text).toBe('Edited first')
    }
    finally { await fixture.close() }
  })

  it.each([false, true])('restores current actor after physical reload, including original URL variant: %s', async (returnToOriginal) => {
    const fixture = await createRuntimeFrameFixture({ standalone: true, extraVariants: ['second'] })
    const frame = fixture.container.querySelector('iframe')!
    const src = frame.src
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
    try {
      publishFrameMessage(frame, VARIANT_READY)
      await fixture.primary.ready
      const second = fixture.session.selection.select({ storyId: 'a:b', variantId: 'second' })
      publishFrameMessage(frame, VARIANT_READY, undefined, { variantId: 'second', selectionVersion: 1 })
      await second
      if (returnToOriginal) {
        const first = fixture.session.selection.select({ storyId: 'a:b', variantId: 'c' })
        publishFrameMessage(frame, VARIANT_READY, undefined, { selectionVersion: 2 })
        await first
      }
      const current = { variantId: returnToOriginal ? 'c' : 'second', selectionVersion: returnToOriginal ? 2 : 1 }
      const restored = { ...current, selectionVersion: current.selectionVersion + 1 }
      const pendingEdit = fixture.session.state.patch({ text: 'Predecessor edit' }).catch(error => error.code)
      await Promise.resolve()
      post.mockClear()
      frame.dispatchEvent(new Event('load'))
      expect(frame.src).toBe(src)
      expect(post.mock.calls.map(([message]) => message)).toContainEqual(expect.objectContaining({ type: PREVIEW_SYNC, storyId: 'a:b', ...restored }))
      expect(await pendingEdit).toBe('RUNTIME_CHANGED')
      publishFrameMessage(frame, VARIANT_READY)
      publishFrameMessage(frame, STATE_SYNC, undefined, { state: { text: 'Stale boot value' } })
      publishFrameMessage(frame, VARIANT_READY, undefined, current)
      publishFrameMessage(frame, STATE_SYNC, undefined, { ...current, state: { text: 'Queued predecessor value' } })
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      expect(fixture.session.getSnapshot().state).toBeNull()
      publishFrameMessage(frame, STATE_SYNC, undefined, { ...restored, state: { text: 'Reloaded current value' } })
      publishFrameMessage(frame, VARIANT_READY, undefined, restored)
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
      expect(fixture.session.getSnapshot().state?.value.text).toBe('Reloaded current value')
    }
    finally { await fixture.close() }
  })
})
