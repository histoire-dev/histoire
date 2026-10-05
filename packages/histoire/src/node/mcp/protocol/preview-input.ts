import { z } from 'zod/v4'
import { previewGlobalsSchema } from '../../runtime/browser/globals.js'
import { CAPTURE_LIMITS } from '../../runtime/browser/limits.js'
import { mcpIdSchema, mcpRequestKeySchema, mcpRevisionSchema } from './ids.js'

/** Shared isolated-preview arguments for screenshots and inspection. */
export const mcpPreviewInputFields = {
  /** Exact registered story. */
  storyId: mcpIdSchema,
  /** Exact scoped variant. */
  variantId: mcpIdSchema,
  /** Caller-required completed catalog publication. */
  expectedRevision: mcpRevisionSchema.optional(),
  /** Principal-owned retry identity. */
  requestKey: mcpRequestKeySchema,
  /** CSS viewport width. */
  width: z.number().int().min(CAPTURE_LIMITS.minWidth).max(CAPTURE_LIMITS.width).default(1280),
  /** CSS viewport height. */
  height: z.number().int().min(CAPTURE_LIMITS.minHeight).max(CAPTURE_LIMITS.height).default(800),
  /** Integer device pixels per CSS pixel. */
  deviceScaleFactor: z.number().int().min(1).max(CAPTURE_LIMITS.deviceScaleFactor).default(1),
  /** Bounded primitive settings; replaces configured defaults when supplied. */
  globals: previewGlobalsSchema.optional(),
  /** Configured theme when omitted. */
  colorScheme: z.enum(['light', 'dark']).optional(),
  /** Rendered text direction. */
  textDirection: z.enum(['ltr', 'rtl']).default('ltr'),
}
