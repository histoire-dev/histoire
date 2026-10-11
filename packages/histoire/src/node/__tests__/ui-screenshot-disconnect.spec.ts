import type { UiScreenshotRequest } from '@histoire/shared'
import type { Context } from '../context.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExecutionService } from '../runtime/execution-service.js'
import { listScreenshotFiles } from '../server/ui-channel/files.js'
import { installUiHttpRouter } from '../server/ui-channel/http.js'
import { registerScreenshotChannel } from '../server/ui-channel/screenshot.js'
import { createMcpPreviewHtmlMiddleware } from '../vite/mcp-preview-html.js'
import { deferred } from './utils/mcp/deferred.js'
import { PREVIEW_PNG } from './utils/mcp/preview-browser.js'
import { uiChannelFixture } from './utils/ui-channel.js'

const preview = await vi.hoisted(async () => {
  const { createPreviewBrowserFixture } = await import('./utils/mcp/preview-browser.js')
  return createPreviewBrowserFixture()
})

vi.mock('../runtime/browser/dependencies.js', () => ({
  resolvePreviewBrowser: async () => preview.launch,
}))

const roots: string[] = []

/** Register the real screenshot channel with one controlled browser launcher. */
function fixture(root: string, targets: UiScreenshotRequest['targets']) {
  const value = uiChannelFixture()
  const server = value.server
  installUiHttpRouter(server)
  createMcpPreviewHtmlMiddleware(server)
  ;(server as { resolvedUrls?: { local: string[] } }).resolvedUrls = { local: ['http://localhost:6006/'] }
  const execution = createExecutionService()
  const context = {
    root,
    mode: 'dev',
    storyFiles: targets.map(target => ({ story: { id: target.storyId, variants: [{ id: target.variantId }] } })),
    config: { backgroundPresets: [], theme: { defaultColorScheme: 'light' } },
  } as Context
  registerScreenshotChannel(context, server, value.channel, execution, () => true, { launch: preview.session.launch })
  return { ...value, execution }
}

/** Build a valid capture request for a distinct set of catalog targets. */
function captureRequest(requestId: string, targets: UiScreenshotRequest['targets']): UiScreenshotRequest {
  return { requestId, targets, viewport: { width: 480, height: 320 }, scale: 1, format: 'png', background: 'transparent' }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  preview.screenshot.mockReset().mockImplementation(async () => PREVIEW_PNG)
})

describe('ui screenshot socket ownership', () => {
  it('stops a disconnected client batch while preserving another tab and queued MCP work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-disconnect-'))
    roots.push(root)
    const firstTargets = [
      { storyId: 'first-saved', variantId: 'variant' },
      { storyId: 'cancelled-second', variantId: 'variant' },
      { storyId: 'cancelled-third', variantId: 'variant' },
    ]
    const otherTargets = [{ storyId: 'other-tab', variantId: 'variant' }]
    const firstRequest = captureRequest('first-owner', firstTargets)
    const otherRequest = captureRequest('other-owner', otherTargets)
    const value = fixture(root, [...firstTargets, ...otherTargets])
    const otherClient = value.newClient()
    const secondTargetStarted = deferred<void>()
    const releaseSecondTarget = deferred<void>()
    let screenshotCalls = 0
    preview.screenshot.mockImplementation(async () => {
      screenshotCalls++
      if (screenshotCalls === 2) {
        secondTargetStarted.resolve()
        await releaseSecondTarget.promise
      }
      return PREVIEW_PNG
    })

    try {
      const receive = value.handlers.get('histoire:ui:screenshot')!
      const firstCapture = receive(firstRequest, value.client)
      await secondTargetStarted.promise
      const otherCapture = receive(otherRequest, otherClient)
      const mcpJob = value.execution.enqueue({ principal: 'mcp-client', run: async () => 'mcp-finished' })
      expect(value.client.socket.listenerCount('close')).toBe(1)
      expect(otherClient.socket.listenerCount('close')).toBe(1)

      value.client.disconnect()
      releaseSecondTarget.resolve()
      const [, , mcpResult] = await Promise.all([firstCapture, otherCapture, mcpJob.result])

      expect(screenshotCalls).toBe(3)
      expect((await listScreenshotFiles(root)).map(file => file.storyId).sort()).toEqual(['first-saved', 'other-tab'])
      expect(value.client.send).not.toHaveBeenCalled()
      expect(otherClient.send).toHaveBeenCalledWith('histoire:ui:screenshot-result', expect.objectContaining({ requestId: 'other-owner', files: [expect.objectContaining({ storyId: 'other-tab' })] }))
      expect(mcpResult).toBe('mcp-finished')
      expect(value.client.socket.listenerCount('close')).toBe(0)
      expect(otherClient.socket.listenerCount('close')).toBe(0)
    }
    finally {
      releaseSecondTarget.resolve()
      await value.channel.close()
      await value.execution.close()
    }
  })

  it('does not enqueue a capture for a socket already closing at admission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-closing-'))
    roots.push(root)
    const targets = [{ storyId: 'story', variantId: 'variant' }]
    const value = fixture(root, targets)
    const enqueue = vi.spyOn(value.execution, 'enqueue')
    value.client.socket.readyState = 2

    try {
      await value.request('histoire:ui:screenshot', captureRequest('closing-owner', targets))

      expect(enqueue).not.toHaveBeenCalled()
      expect(value.client.send).not.toHaveBeenCalled()
      expect(await listScreenshotFiles(root)).toEqual([])
      expect(value.client.socket.listenerCount('close')).toBe(0)
    }
    finally {
      await value.channel.close()
      await value.execution.close()
    }
  })

  it('removes the close observer when channel cleanup cancels an active capture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-cleanup-'))
    roots.push(root)
    const targets = [{ storyId: 'story', variantId: 'variant' }]
    const value = fixture(root, targets)
    const screenshotStarted = deferred<void>()
    const releaseScreenshot = deferred<void>()
    preview.screenshot.mockImplementation(async () => {
      screenshotStarted.resolve()
      await releaseScreenshot.promise
      return PREVIEW_PNG
    })
    const receive = value.handlers.get('histoire:ui:screenshot')!
    const capture = receive(captureRequest('cleanup-owner', targets), value.client)

    try {
      await screenshotStarted.promise
      expect(value.client.socket.listenerCount('close')).toBe(1)
      const closing = value.channel.close()
      releaseScreenshot.resolve()
      await Promise.all([closing, capture])

      expect(value.client.socket.listenerCount('close')).toBe(0)
      expect(value.client.send).not.toHaveBeenCalled()
    }
    finally {
      releaseScreenshot.resolve()
      await value.channel.close()
      await value.execution.close()
    }
  })
})
