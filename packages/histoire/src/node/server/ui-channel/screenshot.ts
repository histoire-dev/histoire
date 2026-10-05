import type { UiChannelError, UiScreenshotRequest, UiScreenshotResult } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { ExecutionService } from '../../runtime/execution-service.js'
import type { UiChannelServer } from './types.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { getDevPreviewHost } from '../../vite/mcp-preview-html.js'
import { listScreenshotFiles, readScreenshotFile, screenshotFilePathForBudget } from './files.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'
import { createUiScreenshotService } from './screenshot-service.js'
import { isUiChannelEventWithinBudget, uiRequestIdSchema, uiScreenshotSchema } from './validation.js'

const screenshotResultEvent = 'histoire:ui:screenshot-result'
const screenshotResultLimitError: UiChannelError = { code: 'invalid', message: 'Capture result exceeds the 64 KB channel limit' }
const largestScreenshotError: UiChannelError = { code: 'unavailable', message: 'Install Playwright in this project: pnpm add -D playwright && pnpm exec playwright install chromium' }

/** Admit only captures whose full exact receipts or target errors fit one event. */
function canSendScreenshotResult(request: UiScreenshotRequest): boolean {
  const files: Extract<UiScreenshotResult, { files: unknown }>['files'] = []
  const errors: NonNullable<Extract<UiScreenshotResult, { files: unknown }>['errors']> = []
  for (const target of request.targets) {
    const file = { path: screenshotFilePathForBudget(target, request.format), storyId: target.storyId, variantId: target.variantId, ...(target.frameKey ? { frameKey: target.frameKey } : {}) }
    const error = { storyId: target.storyId, variantId: target.variantId, ...(target.frameKey ? { frameKey: target.frameKey } : {}), error: largestScreenshotError }
    // Files win for long paths; public failure messages win for short IDs.
    // Keeping the larger exact row bounds every valid mixed completion.
    if (Buffer.byteLength(JSON.stringify(file)) >= Buffer.byteLength(JSON.stringify(error))) files.push(file)
    else errors.push(error)
  }
  return isUiChannelEventWithinBudget(screenshotResultEvent, { requestId: request.requestId, files, ...(errors.length ? { errors } : {}) })
}

/** Publish a compact correlated error if an unexpected result exceeds its frame. */
function sendScreenshotResult(channel: UiChannelServer, result: UiScreenshotResult, client: Parameters<UiChannelServer['send']>[2]): void {
  if (!isUiChannelEventWithinBudget(screenshotResultEvent, result)) result = { requestId: result.requestId, error: screenshotResultLimitError }
  channel.send(screenshotResultEvent, result, client)
}

/** Resolve the same preview host, globals, and theme policy as MCP screenshots. */
export function resolveUiScreenshotTarget(ctx: Context, server: ViteDevServer, isActive: () => boolean, epoch: string, request: UiScreenshotRequest, target: UiScreenshotRequest['targets'][number]) {
  const story = ctx.storyFiles.find(file => file.story?.id === target.storyId)?.story
  if (!isActive() || !story || story.docsOnly || !story.variants.some(variant => variant.id === target.variantId)) throw new Error('Screenshot target unavailable')
  const configuredBackground = ['transparent', '$checkerboard', ...ctx.config.backgroundPresets.map(preset => preset.color)].includes(request.background)
  if (!configuredBackground && !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(request.background)) throw new Error('Screenshot background unavailable')
  const address = server.resolvedUrls?.local[0]
  if (!address) throw new Error('Preview server unavailable')
  return {
    root: ctx.root,
    host: getDevPreviewHost(server),
    target: {
      origin: new URL(address).origin,
      ...target,
      epoch,
      width: request.viewport.width,
      height: request.viewport.height,
      deviceScaleFactor: request.scale,
      globals: ctx.config.preview?.globals ?? {},
      colorScheme: ctx.config.theme.defaultColorScheme === 'auto' ? undefined : ctx.config.theme.defaultColorScheme,
      textDirection: 'ltr' as const,
      backgroundColor: request.background === '$checkerboard' ? 'transparent' : request.background,
      isActive,
    },
  }
}

/** Register correlated capture/list/cancel requests on this dev generation only. */
export function registerScreenshotChannel(ctx: Context, server: ViteDevServer, channel: UiChannelServer, execution: ExecutionService, isActive: () => boolean) {
  const epoch = randomUUID()
  const service = createUiScreenshotService({ root: ctx.root, execution, resolve: (request, target) => resolveUiScreenshotTarget(ctx, server, isActive, epoch, request, target) })
  channel.addCleanup(service.close)
  const imagePrefix = uiHttpPath(server, '/__histoire/screenshots/')
  channel.addCleanup(registerUiHttpRoute(server, imagePrefix, (request, response) => {
    const name = request.url.slice(imagePrefix.length)
    void (async () => {
      const image = isActive() && request.method === 'GET' ? await readScreenshotFile(ctx.root, name) : undefined
      response.statusCode = image ? 200 : 404
      response.setHeader('content-type', image?.mimeType ?? 'text/plain')
      response.setHeader('x-content-type-options', 'nosniff')
      response.setHeader('cache-control', 'no-store')
      response.end(image?.bytes ?? 'Screenshot unavailable')
    })().catch(() => {
      response.statusCode = 404
      response.end('Screenshot unavailable')
    })
  }, isActive))
  channel.on('histoire:ui:screenshot', value => value, async (value, client) => {
    const parsed = uiScreenshotSchema.safeParse(value)
    if (!parsed.success) {
      const identity = uiRequestIdSchema.safeParse(value && typeof value === 'object' ? { requestId: (value as { requestId?: unknown }).requestId } : undefined)
      if (identity.success) sendScreenshotResult(channel, { requestId: identity.data.requestId, error: { code: 'invalid', message: 'Invalid screenshot options' } }, client)
      return
    }
    const request = parsed.data as UiScreenshotRequest
    if (!canSendScreenshotResult(request)) {
      sendScreenshotResult(channel, { requestId: request.requestId, error: screenshotResultLimitError }, client)
      return
    }
    try {
      sendScreenshotResult(channel, await service.capture(request, client), client)
    }
    catch {
      sendScreenshotResult(channel, { requestId: request.requestId, error: { code: 'failed', message: 'Screenshot could not be captured' } }, client)
    }
  })
  channel.on('histoire:ui:screenshot-cancel', value => uiRequestIdSchema.parse(value), (value, client) => service.cancel(value.requestId, client))
  channel.on('histoire:ui:screenshot-list', value => uiRequestIdSchema.parse(value), async (value, client) => {
    channel.send('histoire:ui:screenshot-list-result', { requestId: value.requestId, files: await listScreenshotFiles(ctx.root, value.requestId) }, client)
  })
}
