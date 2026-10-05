import type { UiScreenshotRequest } from '@histoire/shared'
import type { Context } from '../context.js'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExecutionService } from '../runtime/execution-service.js'
import { listScreenshotFiles, saveScreenshotFile } from '../server/ui-channel/files.js'
import { installUiHttpRouter } from '../server/ui-channel/http.js'
import { registerScreenshotChannel } from '../server/ui-channel/screenshot.js'
import { UI_CHANNEL_BYTES } from '../server/ui-channel/validation.js'
import { createMcpPreviewHtmlMiddleware } from '../vite/mcp-preview-html.js'
import { PREVIEW_PNG } from './utils/mcp/preview-browser.js'
import { uiChannelFixture } from './utils/ui-channel.js'

const roots: string[] = []
const preview = await vi.hoisted(async () => {
  const { createPreviewBrowserFixture } = await import('./utils/mcp/preview-browser.js')
  return createPreviewBrowserFixture()
})

vi.mock('../runtime/browser/dependencies.js', () => ({
  resolvePreviewBrowser: async () => preview.launch,
}))

/** Register the real screenshot event handlers against one inspectable socket. */
function fixture(context: Context) {
  const value = uiChannelFixture()
  installUiHttpRouter(value.server)
  createMcpPreviewHtmlMiddleware(value.server)
  ;(value.server as { resolvedUrls?: { local: string[] } }).resolvedUrls = { local: ['http://localhost:6006/'] }
  const execution = createExecutionService()
  registerScreenshotChannel(context, value.server, value.channel, execution, () => true)
  return { ...value, execution }
}

/** Capture options whose input fits while every exact successful receipt does not. */
function oversizedCapture(): UiScreenshotRequest {
  return {
    requestId: 'capture-correlation',
    targets: Array.from({ length: 64 }, (_, index) => ({ storyId: `story-${index}-${'s'.repeat(420)}`, variantId: `variant-${index}-${'v'.repeat(420)}` })),
    viewport: { width: 480, height: 320 },
    scale: 1,
    format: 'png',
    background: 'transparent',
  }
}

/** Project catalog authority accepts every target while browser work stays fixture-owned. */
function context(root: string, input: UiScreenshotRequest): Context {
  return {
    root,
    mode: 'dev',
    storyFiles: input.targets.map(target => ({ story: { id: target.storyId, variants: [{ id: target.variantId }] } })),
    config: { backgroundPresets: [], theme: { defaultColorScheme: 'light' } },
  } as Context
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('bounded screenshot channel replies', () => {
  it('rejects a valid 64-target capture before writing receipts that cannot fit one correlated event', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-channel-'))
    roots.push(root)
    const input = oversizedCapture()
    const value = fixture(context(root, input))
    const enqueue = vi.spyOn(value.execution, 'enqueue')
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)

    await value.request('histoire:ui:screenshot', input)

    expect(enqueue).not.toHaveBeenCalled()
    expect(value.client.send).toHaveBeenCalledOnce()
    const [event, result] = value.client.send.mock.calls[0]
    expect(event).toBe('histoire:ui:screenshot-result')
    expect(result).toMatchObject({ requestId: input.requestId, error: { code: 'invalid' } })
    expect(Buffer.byteLength(JSON.stringify({ type: 'custom', event, data: result }))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)
    expect(await listScreenshotFiles(root)).toEqual([])
    await value.channel.close()
    await value.execution.close()
  })

  it('delivers every exact receipt when a 64-target capture fits its correlated event', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-receipts-'))
    roots.push(root)
    const input = { ...oversizedCapture(), requestId: 'all-receipts', targets: Array.from({ length: 64 }, (_, index) => ({ storyId: `story-${index}`, variantId: `variant-${index}` })) }
    const value = fixture(context(root, input))

    await value.request('histoire:ui:screenshot', input)

    expect(value.client.send).toHaveBeenCalledOnce()
    const [event, result] = value.client.send.mock.calls[0]
    expect(event).toBe('histoire:ui:screenshot-result')
    expect(result).toEqual({ requestId: input.requestId, files: expect.any(Array) })
    expect(result.files.map((file: { storyId: string, variantId: string }) => [file.storyId, file.variantId])).toEqual(input.targets.map(target => [target.storyId, target.variantId]))
    expect(Buffer.byteLength(JSON.stringify({ type: 'custom', event, data: result }))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)
    await value.channel.close()
    await value.execution.close()
  })

  it('preserves escaped list correlation and exact whole file rows within the real custom-event budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-list-'))
    roots.push(root)
    const requestId = '\u0001'.repeat(256)
    const storyId = 's'.repeat(1_480)
    const variantId = 'v'.repeat(1_480)
    const value = fixture(context(root, { requestId: 'capture', targets: [], viewport: { width: 480, height: 320 }, scale: 1, format: 'png', background: 'transparent' }))
    await Promise.all(Array.from({ length: 20 }, () => saveScreenshotFile(root, { storyId, variantId }, 'png', PREVIEW_PNG)))

    await value.request('histoire:ui:screenshot-list', { requestId })

    expect(value.client.send).toHaveBeenCalledOnce()
    const [event, result] = value.client.send.mock.calls[0]
    expect(event).toBe('histoire:ui:screenshot-list-result')
    expect(result.requestId).toBe(requestId)
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.files.length).toBeLessThan(20)
    expect(result.files).toEqual(expect.arrayContaining([expect.objectContaining({ storyId, variantId })]))
    expect(Buffer.byteLength(JSON.stringify({ type: 'custom', event, data: result }))).toBeLessThanOrEqual(UI_CHANNEL_BYTES)
    await value.channel.close()
    await value.execution.close()
  })
})
