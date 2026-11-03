import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolbarButton, toolbarFixture } from './fixtures/canvas-toolbar.js'
import { emitScreenshotResult, resetScreenshotChannel, screenshotChannel, setupRequests, setupSnapshot } from './fixtures/screenshot-channel.js'

vi.mock('virtual:$histoire-config', () => ({ config: { responsivePresets: [], backgroundPresets: [], theme: {} }, logos: {} }))
vi.mock('../../../histoire-app/src/app/util/ui-channel.js', async () => {
  const { screenshotTransport } = await import('./fixtures/screenshot-channel.js')
  return screenshotTransport
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetScreenshotChannel()
  document.body.replaceChildren()
})

/** Find a real action inside the current screenshot dialog by visible text. */
function action(label: string): HTMLButtonElement | null {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"][aria-label="Screenshot"] button')]
    .find(button => button.textContent?.trim() === label) ?? null
}

/** Read the current screenshot dialog without inspecting presentation classes. */
function dialogText(): string {
  return document.querySelector('[role="dialog"][aria-label="Screenshot"]')?.textContent ?? ''
}

/** Complete one exact setup request at the external service boundary. */
async function ready(requestId: string, revision = 1): Promise<void> {
  await emitScreenshotResult('histoire:ui:screenshot-setup-result', {
    requestId,
    setup: setupSnapshot({ revision, state: 'ready', reason: undefined, source: 'chrome', repairs: [] }),
  })
}

describe('automatic screenshot setup checks', () => {
  it.each(['browser setup', 'service'] as const)('checks on each open and recovers when %s fails', async (failure) => {
    const test = await toolbarFixture()
    try {
      expect(setupRequests()).toEqual([])
      toolbarButton('Screenshot').click()
      await test.geometry.flush()
      expect(setupRequests().map(request => request.action)).toEqual(['check'])
      await vi.waitFor(() => expect(dialogText()).toContain('Checking screenshot setup'))
      expect(action('Capture 1 frame')).toBeNull()
      await ready(setupRequests()[0].requestId)
      const capture = action('Capture 1 frame')!
      expect(capture).not.toBeNull()

      toolbarButton('Screenshot').click()
      await test.geometry.flush()
      toolbarButton('Screenshot').click()
      await test.geometry.flush()
      expect(setupRequests().map(request => request.action)).toEqual(['check', 'check'])
      await vi.waitFor(() => expect(dialogText()).toContain('Checking screenshot setup'))
      expect(action('Capture 1 frame')).toBeNull()
      capture.click()
      expect(screenshotChannel.send.mock.calls.some(([event]) => event === 'histoire:ui:screenshot')).toBe(false)
      await emitScreenshotResult('histoire:ui:screenshot-setup-result', {
        requestId: setupRequests()[1].requestId,
        ...(failure === 'browser setup'
          ? { setup: setupSnapshot({ revision: 2 }) }
          : { error: { code: 'unavailable', message: 'Screenshot setup check is unavailable' } }),
      })
      expect(dialogText()).toContain(failure === 'browser setup' ? 'No screenshot browser driver was found.' : 'Screenshot setup check is unavailable')
      expect(action('Capture 1 frame')).toBeNull()
      action('Check again')!.click()
      await test.geometry.flush()
      const refresh = setupRequests().at(-1)!
      expect(refresh.action).toBe('refresh')
      await emitScreenshotResult('histoire:ui:screenshot-setup-result', {
        requestId: refresh.requestId,
        setup: setupSnapshot({ revision: 3, state: 'unverified', reason: undefined, repairs: [] }),
      })
      expect(setupRequests().map(request => request.action)).toEqual(['check', 'check', 'refresh', 'check'])
      await ready(setupRequests().at(-1)!.requestId, 4)
      expect(action('Capture 1 frame')).not.toBeNull()
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })

  it('reuses pending check across close, reopen, and toolbar relocation', async () => {
    const test = await toolbarFixture()
    try {
      toolbarButton('Screenshot').click()
      await test.geometry.flush()
      const request = setupRequests()[0]
      expect(request.action).toBe('check')
      toolbarButton('Screenshot').click()
      await test.geometry.flush()
      toolbarButton('Screenshot').click()
      await test.geometry.flush()
      test.geometry.resize(100)
      await test.geometry.flush()
      expect(setupRequests()).toEqual([request])
      expect(screenshotChannel.send.mock.calls.some(([event]) => event === 'histoire:ui:screenshot-setup-cancel')).toBe(false)
      // Reopen while the original check is pending if overflow dismissed its panel.
      test.geometry.resize(1000)
      await test.geometry.flush()
      if (toolbarButton('Screenshot').getAttribute('aria-expanded') !== 'true') {
        toolbarButton('Screenshot').click()
        await test.geometry.flush()
      }
      expect(setupRequests()).toEqual([request])
      await ready(request.requestId)
      expect(action('Capture 1 frame')).not.toBeNull()
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })

  it.each(['initially open', 'context action'] as const)('checks when opened by %s', async (entry) => {
    const test = await toolbarFixture(entry === 'initially open' ? { open: 'screenshot' } : {})
    try {
      if (entry === 'context action') {
        test.screenshotTrigger.value++
        await test.geometry.flush()
      }
      expect(setupRequests().map(request => request.action)).toEqual(['check'])
      await vi.waitFor(() => expect(dialogText()).toContain('Checking screenshot setup'))
      await ready(setupRequests()[0].requestId)
      expect(action('Capture 1 frame')).not.toBeNull()
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })

  it.each(['unmount', 'disconnect'] as const)('cancels owned check on %s and ignores late success', async (ending) => {
    const test = await toolbarFixture({ open: 'screenshot' })
    let unmounted = false
    try {
      const request = setupRequests()[0]
      expect(request.action).toBe('check')
      const lateListeners = [...screenshotChannel.listeners.get('histoire:ui:screenshot-setup-result')!]
      if (ending === 'unmount') {
        test.wrapper.unmount()
        unmounted = true
      }
      else {
        for (const disconnect of [...screenshotChannel.disconnect]) disconnect()
      }
      expect(screenshotChannel.send.mock.calls.filter(([event]) => event === 'histoire:ui:screenshot-setup-cancel'))
        .toEqual([['histoire:ui:screenshot-setup-cancel', { requestId: request.requestId }]])
      for (const listener of lateListeners) {
        listener({ requestId: request.requestId, setup: setupSnapshot({ revision: 10, state: 'ready', reason: undefined, source: 'chrome', repairs: [] }) })
      }
      await test.geometry.flush()
      expect(action('Capture 1 frame')).toBeNull()
      if (ending === 'disconnect') {
        expect(dialogText()).toContain('Screenshot setup service unavailable')
        test.screenshotOpen.value = null
        await test.geometry.flush()
        test.screenshotOpen.value = 'screenshot'
        await test.geometry.flush()
        await ready(setupRequests().at(-1)!.requestId)
        expect(action('Capture 1 frame')).not.toBeNull()
      }
    }
    finally {
      if (!unmounted) test.wrapper.unmount()
      await test.session.dispose()
    }
  })

  it('preserves recent captures and returns to setup after capture failure', async () => {
    const test = await toolbarFixture({ open: 'screenshot' })
    try {
      await ready(setupRequests()[0].requestId)
      action('Capture 1 frame')!.click()
      await test.geometry.flush()
      const first = screenshotChannel.send.mock.calls.findLast(([event]) => event === 'histoire:ui:screenshot')![1] as { requestId: string }
      await emitScreenshotResult('histoire:ui:screenshot-result', {
        requestId: first.requestId,
        files: [{ path: '.histoire/screenshots/story--variant.png', storyId: 'a:b', variantId: 'c' }],
      })
      expect(dialogText()).toContain('Recent')
      expect(dialogText()).toContain('story--variant.png')
      action('Capture 1 frame')!.click()
      await test.geometry.flush()
      const second = screenshotChannel.send.mock.calls.findLast(([event]) => event === 'histoire:ui:screenshot')![1] as { requestId: string }
      await emitScreenshotResult('histoire:ui:screenshot-result', {
        requestId: second.requestId,
        error: { code: 'failed', message: 'Screenshot browser unavailable', setup: setupSnapshot({ revision: 2 }) },
      })
      expect(dialogText()).toContain('Screenshot setup needed')
      expect(action('Capture 1 frame')).toBeNull()
      expect(dialogText()).not.toContain('Recent')
      expect(dialogText()).not.toContain('story--variant.png')
    }
    finally {
      test.wrapper.unmount()
      await test.session.dispose()
    }
  })
})
