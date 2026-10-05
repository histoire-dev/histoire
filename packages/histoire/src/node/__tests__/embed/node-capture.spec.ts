import type { ProjectServices } from '../../api/internal.js'
import { describe, expect, it, vi } from 'vitest'
import { captureProjectScreenshot } from '../../api/capture.js'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'

const screenshot = vi.hoisted(() => vi.fn(() => ({ run: async () => ({ artifact: new Uint8Array([1]), result: { width: 480, height: 320, mimeType: 'image/png', sha256: 'hash' } }) })))
vi.mock('../../runtime/browser/screenshot.js', () => ({ createScreenshotTask: screenshot }))

/** Captured immutable preview supplies authority without any live catalog. */
function fixture() {
  const execution = createExecutionService()
  let active = true
  const source = { epoch: 'preview', origin: 'http://book.test', base: '/nested/', execution: createExecutionOwner(execution), registry: {}, isActive: () => active, snapshot: { capture: { available: true }, defaults: { colorScheme: 'dark', textDirection: 'rtl', globals: { theme: 'default' } }, getTarget: vi.fn() } }
  const services = { root: '/project', execution, preview: { handle: { status: 'ready' }, current: source } } as unknown as ProjectServices
  return { services, source, close: () => {
    active = false
  }, execution }
}

describe('node capture admission', () => {
  it('captures preview defaults and caller globals before queued execution', async () => {
    const test = fixture()
    const globals = { theme: 'chosen' }
    const result = captureProjectScreenshot(test.services, { storyId: 'story', variantId: 'variant', globals })
    globals.theme = 'mutated'
    await expect(result).resolves.toMatchObject({ png: new Uint8Array([1]), width: 480, height: 320 })
    expect(screenshot.mock.lastCall?.[0]).toMatchObject({ host: test.source.registry, target: { epoch: 'preview', globals: { theme: 'chosen' }, textDirection: 'rtl', deviceScaleFactor: 1 } })
    expect(test.source.snapshot.getTarget).toHaveBeenCalledWith('story', 'variant')
    await test.execution.close()
  })

  it('rejects invalid DPR before admission and never falls back from unavailable preview', async () => {
    const test = fixture()
    const before = screenshot.mock.calls.length
    await expect(captureProjectScreenshot(test.services, { storyId: 'story', variantId: 'variant', deviceScaleFactor: 1.5 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    test.services.preview!.handle.status = 'starting' as any
    test.services.dev = { handle: { status: 'ready' } } as any
    await expect(captureProjectScreenshot(test.services, { storyId: 'story', variantId: 'variant' })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(screenshot.mock.calls.length).toBe(before)
    await test.execution.close()
  })

  it('revalidates source owner at lane head and cancels queued capture without launch', async () => {
    const test = fixture()
    let release: () => void
    const blocker = test.execution.enqueue({ run: () => new Promise<void>((resolve) => {
      release = resolve
    }) })
    await Promise.resolve()
    const stale = captureProjectScreenshot(test.services, { storyId: 'story', variantId: 'variant' })
    test.close()
    release!()
    await blocker.result
    await expect(stale).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    await test.execution.close()
  })
})
