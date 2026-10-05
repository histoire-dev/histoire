// @vitest-environment jsdom
import { VARIANT_READY } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { createPreviewRuntimeApp } from './utils/preview-runtime-app.js'

describe('generated runtime reload selection recovery', () => {
  it.each([false, true])('acknowledges restored original actor after bootstrap frame already published: %s', async (bootReady) => {
    const runtime = createPreviewRuntimeApp()
    try {
      await runtime.ticks()
      if (bootReady) await runtime.frames()
      runtime.messages.length = 0
      const restored = runtime.select('first', 2)
      await runtime.frames()
      await restored
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([
        expect.objectContaining({ storyId: 'story', variantId: 'first', selectionVersion: 2, documentId: 'document' }),
      ])
    }
    finally { runtime.close() }
  })

  it('mounts restored different actor and rejects delayed original bootstrap readiness', async () => {
    const runtime = createPreviewRuntimeApp()
    try {
      await runtime.ticks()
      const restored = runtime.select('second', 1)
      await runtime.frames()
      await restored
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([
        expect.objectContaining({ variantId: 'second', selectionVersion: 1 }),
      ])
    }
    finally { runtime.close() }
  })

  it('waits for fresh renderer when returning to previously ready variant', async () => {
    const runtime = createPreviewRuntimeApp()
    try {
      await runtime.frames()
      const second = runtime.select('second', 1)
      await runtime.frames()
      await second
      runtime.messages.length = 0
      runtime.pauseRendering()
      const first = runtime.select('first', 2)
      await runtime.frames()
      await first
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([])
      runtime.renderReady()
      await runtime.frames()
      expect(runtime.messages.filter(message => message.type === VARIANT_READY)).toEqual([
        expect.objectContaining({ variantId: 'first', selectionVersion: 2 }),
      ])
    }
    finally { runtime.close() }
  })
})
