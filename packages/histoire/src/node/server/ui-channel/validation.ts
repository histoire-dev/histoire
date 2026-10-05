import { Buffer } from 'node:buffer'
import { measureWireValue } from '@histoire/shared'
import { z } from 'zod/v4'
import { CAPTURE_LIMITS } from '../../runtime/browser/limits.js'

/** Shared event size ceiling, measured in encoded bytes. */
export const UI_CHANNEL_BYTES = 64 * 1024

/** Reject non-JSON values and oversized payloads before feature code executes. */
export function assertUiPayload(value: unknown): void {
  const json = JSON.stringify(value)
  if (json === undefined || Buffer.byteLength(json) > UI_CHANNEL_BYTES) throw new Error('UI payload exceeds 64 KB or is not JSON')
}

/** Check Vite's complete custom-event frame before a feature admits bounded work. */
export function isUiChannelEventWithinBudget(event: string, data: unknown): boolean {
  try {
    const json = JSON.stringify({ type: 'custom', event, data })
    return json !== undefined && Buffer.byteLength(json) <= UI_CHANNEL_BYTES
  }
  catch {
    return false
  }
}

/** Existing identifiers stay scoped and cannot be used as filesystem paths. */
const identifier = z.string().min(1).max(256)
/** Browser correlation identity cannot collide with another client's cancellation. */
export const uiRequestIdSchema = z.strictObject({ requestId: identifier })
/** Exact capture request with browser viewport bounds shared with MCP. */
export const uiScreenshotSchema = z.strictObject({
  requestId: identifier,
  targets: z.array(z.strictObject({
    storyId: z.string().min(1).max(4096),
    variantId: z.string().min(1).max(4096),
    frameKey: z.string().min(1).max(UI_CHANNEL_BYTES).optional(),
    propsOverride: z.custom<Record<string, unknown>>((value) => {
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false
        measureWireValue(value, { maxBytes: 16 * 1024 })
        return !Object.keys(value).some(name => name.startsWith('_h'))
      }
      catch { return false }
    }).optional(),
  })).min(1).max(64),
  viewport: z.strictObject({ width: z.number().int().min(CAPTURE_LIMITS.minWidth).max(CAPTURE_LIMITS.width), height: z.number().int().min(CAPTURE_LIMITS.minHeight).max(CAPTURE_LIMITS.height) }),
  scale: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  format: z.enum(['png', 'webp']),
  background: z.string().min(1).max(256),
})
/** Exact operation cancellation request. */
export const uiMcpCancelSchema = z.strictObject({ operationId: identifier })
