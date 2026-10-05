// @vitest-environment jsdom
import { STATE_SYNC, VARIANT_READY } from '@histoire/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeFrameFixture, publishFrameMessage } from '../utils/embed/runtime-frame.js'

const digest = 'a'.repeat(64)
const changedDigest = 'b'.repeat(64)

describe('story-scoped runtime revisions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', class {
      /** Real runtime protocol owns readiness; jsdom does not compute geometry. */
      observe = vi.fn()
      /** Only this fixture's observer is released. */
      disconnect = vi.fn()
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retains unchanged actor on unrelated publication and rebinds current source revision for state', async () => {
    const fixture = await createRuntimeFrameFixture({ runtimeRevision: digest })
    const frame = fixture.container.querySelector('iframe')!
    const initialUrl = frame.src
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      fixture.source.descriptor.catalog.stories[1].runtimeRevision = changedDigest
      fixture.source.descriptor.revision = 'unrelated-story-change'
      fixture.source.emitCatalog()
      expect(frame.src).toBe(initialUrl)
      expect(fixture.session.getSnapshot()).toMatchObject({ source: { revision: 'unrelated-story-change' }, runtime: { status: 'ready', runtimeId: new URL(initialUrl).searchParams.get('documentId') } })
      publishFrameMessage(frame, STATE_SYNC, undefined, { state: { count: 42 } })
      expect(fixture.session.getSnapshot().state?.value).toEqual({ count: 42 })
    }
    finally { await fixture.close() }
  })

  it.each(['runtimeRevision', 'epoch'] as const)('mints a new actor when %s changes', async (field) => {
    const fixture = await createRuntimeFrameFixture({ runtimeRevision: digest })
    const frame = fixture.container.querySelector('iframe')!
    const initialUrl = frame.src
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      if (field === 'runtimeRevision') fixture.source.descriptor.catalog.stories[0].runtimeRevision = changedDigest
      else fixture.source.descriptor.epoch = 'config-restart'
      fixture.source.descriptor.revision = 'affected-story-change'
      fixture.source.emitCatalog()
      expect(frame.src).not.toBe(initialUrl)
      publishFrameMessage(frame, VARIANT_READY, new URL(initialUrl).searchParams.get('documentId'))
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
      publishFrameMessage(frame, VARIANT_READY)
      expect(fixture.session.getSnapshot().runtime.status).toBe('ready')
    }
    finally { await fixture.close() }
  })

  it.each([{ initial: undefined, next: undefined }, { initial: digest, next: undefined }, { initial: undefined, next: digest }])('conservatively remounts when a descriptor lacks digest %j', async ({ initial, next }) => {
    const fixture = await createRuntimeFrameFixture({ runtimeRevision: initial })
    const frame = fixture.container.querySelector('iframe')!
    const initialUrl = frame.src
    publishFrameMessage(frame, VARIANT_READY)
    await fixture.primary.ready
    try {
      if (next) fixture.source.descriptor.catalog.stories[0].runtimeRevision = next
      else delete fixture.source.descriptor.catalog.stories[0].runtimeRevision
      fixture.source.descriptor.revision = 'legacy-publication'
      fixture.source.emitCatalog()
      expect(frame.src).not.toBe(initialUrl)
      expect(fixture.session.getSnapshot().runtime.status).toBe('mounting')
    }
    finally { await fixture.close() }
  })
})
