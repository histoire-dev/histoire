import type { UiVisualReply, UiVisualRequest } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { ExecutionService } from '../../runtime/execution-service.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { VISUAL_APPROVAL_BATCH_LIMIT } from '@histoire/shared'
import { z } from 'zod/v4'
import { resolveVisualConfig } from '../../visual/config.js'
import { safeVisualRead } from '../../visual/files.js'
import { visualReviewCase } from '../../visual/review.js'
import { createVisualService } from '../../visual/service.js'
import { onVisualSourceRetired, resolveVisualSource } from '../../visual/source.js'
import { registerUiHttpRoute, uiHttpPath } from './http.js'
import { isUiChannelEventWithinBudget } from './validation.js'

/** Inputs remain strict; saved props get existing getter-safe JSON validation in service. */
const identity = z.string().min(1).max(256)
const offset = z.number().int().min(0).optional()
const runOptions = z.strictObject({ storyId: identity.optional(), variantId: identity.optional(), caseId: identity.optional(), profileId: identity.optional(), baselineRef: identity.optional(), incremental: z.boolean().optional() })
const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({ requestId: identity, action: z.literal('inventory'), offset }),
  z.strictObject({ requestId: identity, action: z.literal('recover'), offset }),
  z.strictObject({ requestId: identity, action: z.literal('approve-review'), selections: z.array(z.strictObject({ handle: identity, resultId: identity })).min(1).max(VISUAL_APPROVAL_BATCH_LIMIT) }),
  z.strictObject({ requestId: identity, action: z.literal('save'), case: z.strictObject({ storyId: z.string().min(1).max(4096), variantId: z.string().min(1).max(4096), label: z.string().min(1).max(512), propsOverride: z.record(z.string(), z.unknown()), axes: z.record(z.string(), z.unknown()).optional() }) }),
  z.strictObject({ requestId: identity, action: z.literal('remove'), caseId: identity }),
  z.strictObject({ requestId: identity, action: z.literal('run'), options: runOptions.optional() }),
  z.strictObject({ requestId: identity, action: z.literal('cancel'), runId: identity }),
  z.strictObject({ requestId: identity, action: z.literal('results'), runId: identity, offset }),
  // Even JSON-escaped failure receipts fit within one 64 KB event.
  z.strictObject({ requestId: identity, action: z.literal('approve'), options: z.strictObject({ runId: identity, resultIds: z.array(identity).min(1).max(32) }) }),
])

/** Group streamed items (receipts, planned IDs) into as few events as channel budget allows. */
export function visualEventChunks<T>(items: readonly T[]): T[][] {
  const chunks: T[][] = []
  let chunk: T[] = []
  for (const item of items) {
    // Reserve room for envelope fields around items array.
    if (chunk.length && !isUiChannelEventWithinBudget('histoire:ui:visual-result', [...chunk, item], 1024)) {
      chunks.push(chunk)
      chunk = []
    }
    chunk.push(item)
  }
  if (chunk.length) chunks.push(chunk)
  return chunks
}

/** Bound pages by bytes as well as rows; oversized exact records fail explicitly. */
export function visualPage<T>(items: readonly T[], start: number): { items: T[], nextOffset?: number } {
  const page: T[] = []
  for (const item of items.slice(start, start + 32)) {
    if (new TextEncoder().encode(JSON.stringify([...page, item])).byteLength > 48 * 1024) {
      break
    }
    page.push(item)
  }
  if (!page.length && start < items.length) {
    throw new Error('Visual result exceeds channel page limit')
  }
  const next = start + page.length
  return { items: page, ...(next < items.length ? { nextOffset: next } : {}) }
}

/** Attach one generation-owned visual adapter to existing UI socket and image routes. */
export function registerVisualChannel(ctx: Context, server: ViteDevServer, channel: UiChannelServer, execution: ExecutionService, isActive: () => boolean) {
  if (!resolveVisualConfig(ctx.config.visual)) {
    return
  }
  const service = createVisualService(() => resolveVisualSource(ctx, server, execution, isActive))
  const reviews = new Map<UiChannelClient, ReturnType<typeof service.createReviewSession>>()
  const owned = new Map<string, UiChannelClient>()
  const controllers = new Map<string, AbortController>()
  const disconnects = new Map<UiChannelClient, () => void>()
  /** Preserve exact private correlation while bounding full Vite event envelope. */
  function send(client: UiChannelClient, reply: UiVisualReply) {
    if (isUiChannelEventWithinBudget('histoire:ui:visual-result', reply)) {
      channel.send('histoire:ui:visual-result', reply, client)
    }
    else {
      channel.send('histoire:ui:visual-result', { requestId: reply.requestId, error: 'Visual result exceeds channel limit' }, client)
    }
  }
  channel.addCleanup(onVisualSourceRetired(server, () => {
    for (const controller of controllers.values()) controller.abort()
    for (const [id, client] of owned) {
      const run = service.getRun(id)
      if (run && client.socket.readyState === 1) send(client, { requestId: id, run: { ...run, results: [], stale: true } })
    }
  }))
  /** Socket teardown aborts only this browser and revokes retained-image approval. */
  function observeDisconnect(client: UiChannelClient) {
    if (disconnects.has(client)) {
      return
    }
    reviews.set(client, service.createReviewSession())
    const close = () => {
      reviews.get(client)?.close()
      reviews.delete(client)
      for (const [id, owner] of owned) {
        if (owner === client) {
          controllers.get(id)?.abort()
          owned.delete(id)
        }
      }
      disconnects.delete(client)
    }
    disconnects.set(client, close)
    client.socket.once('close', close)
  }
  channel.on('histoire:ui:visual', value => value, async (value, client) => {
    const parsed = requestSchema.safeParse(value)
    if (!parsed.success) {
      const requestId = identity.safeParse((value as { requestId?: unknown })?.requestId)
      if (requestId.success) {
        send(client, { requestId: requestId.data, error: 'Invalid visual request' })
      }
      return
    }
    const request = parsed.data as UiVisualRequest
    observeDisconnect(client)
    try {
      if (request.action === 'recover') {
        send(client, { requestId: request.requestId, recovered: await reviews.get(client)!.recoverPage(request.offset) })
      }
      else if (request.action === 'approve-review') {
        const review = reviews.get(client)!
        await review.approve(request.selections, (receipts) => {
          if (!isActive() || client.socket.readyState !== 1) return
          for (const chunk of visualEventChunks(receipts)) send(client, { requestId: request.requestId, receipts: chunk, done: false })
        })
        send(client, { requestId: request.requestId, done: true })
      }
      else if (request.action === 'inventory') {
        const cases = await service.listCases()
        const config = resolveVisualConfig(ctx.config.visual)!
        const page = visualPage(cases.map(visualReviewCase), request.offset ?? 0)
        send(client, { requestId: request.requestId, inventory: { cases: page.items, total: cases.length, nextOffset: page.nextOffset, profiles: config.profiles.map(profile => ({ id: profile.id })), baselineRef: config.baselineRef } })
      }
      else
        if (request.action === 'save') {
          send(client, { requestId: request.requestId, case: visualReviewCase(await service.saveCase(request.case)) })
        }
        else
          if (request.action === 'remove') {
            await service.removeCase(request.caseId)
            send(client, { requestId: request.requestId, done: true })
          }
          else
            if (request.action === 'run') {
              const abort = new AbortController()
              const key = `${request.requestId}`
              if (owned.has(key) || controllers.has(key)) {
                throw new Error('Visual request identity already in use')
              }
              if ([...controllers.keys()].some(id => owned.get(id) === client)) {
                throw new Error('Visual run already active')
              }
              controllers.set(key, abort)
              owned.set(key, client)
              try {
                await service.run({ ...request.options, signal: abort.signal }, (run) => {
                  if (!isActive() || client.socket.readyState !== 1) {
                    abort.abort()
                    return
                  }
                  owned.set(run.id, client)
                  controllers.set(run.id, abort)
                  send(client, { requestId: request.requestId, run: { ...run, results: [] }, completed: run.results.length })
                }, (resultIds) => {
                  // Browser busies only these rows; chunks arrive before first progress reply.
                  if (!isActive() || client.socket.readyState !== 1) return
                  for (const chunk of visualEventChunks(resultIds)) send(client, { requestId: request.requestId, planned: chunk })
                })
              }
              finally {
                for (const [id, controller] of controllers) {
                  if (controller === abort) {
                    controllers.delete(id)
                  }
                }
                owned.delete(key)
              }
            }
            else {
              if (owned.get(request.action === 'approve' ? request.options.runId : request.runId) !== client) {
                throw new Error('Visual run unavailable for this browser')
              }
              if (request.action === 'cancel') {
                controllers.get(request.runId)?.abort()
                send(client, { requestId: request.requestId, done: true })
              }
              else
                if (request.action === 'approve') {
                  send(client, { requestId: request.requestId, receipts: await service.approve(request.options) })
                }
                else {
                  const run = service.getRun(request.runId)
                  if (!run) {
                    throw new Error('Visual run unavailable')
                  }
                  const start = request.offset ?? 0
                  const page = visualPage(await reviews.get(client)!.claim(run, start, 32), 0)
                  const next = start + page.items.length
                  send(client, { requestId: request.requestId, run: { ...run, results: page.items }, completed: run.results.length, ...(next < run.results.length ? { nextOffset: next } : {}) })
                }
            }
    }
    catch (error) {
      send(client, { requestId: request.requestId, error: error instanceof Error ? error.message.replaceAll(/preview/gi, 'canvas').slice(0, 512) : 'Visual operation failed' })
    }
  })
  const prefix = uiHttpPath(server, '/__histoire/visual/')
  channel.addCleanup(registerUiHttpRoute(server, prefix, async (request, response) => {
    const match = request.url?.slice(prefix.length).match(/^([\da-f-]{36})\/([\da-f]{64})-(baseline|current|diff)\.png$/)
    const run = match && service.getRun(match[1])
    const result = run?.results.find(result => result.id === match![2])
    const name = result?.images[match![3] as 'current'] ?? (match ? [...reviews.values()].map(review => review.artifact(match[1], match[2], match[3] as 'current')).find(Boolean) : undefined)
    const bytes = request.method === 'GET' && name ? await safeVisualRead(ctx.root, `.histoire/visual/runs/${match![1]}/images/${name}`) : undefined
    response.statusCode = bytes ? 200 : 404
    response.setHeader('content-type', bytes ? 'image/png' : 'text/plain')
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.end(bytes ?? 'Visual image unavailable')
  }, isActive))
  channel.addCleanup(async () => {
    for (const controller of controllers.values()) {
      controller.abort()
    }
    for (const [client, close] of disconnects) {
      client.socket.off('close', close)
    }
    for (const review of reviews.values()) review.close()
    reviews.clear()
    disconnects.clear()
    owned.clear()
    await service.close()
  })
}
