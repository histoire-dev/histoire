import { invalid, validateEmbedOrigin } from '../bridge/validation.js'

/** Present override distinguishes replacement from an absent deployment file/env. */
export interface HistoireEmbedOriginOverride {
  /** Whether deployer supplied an override, including malformed/unreadable input. */
  present: boolean
  /** Parsed additional origins; malformed values fail closed. */
  value?: unknown
}

/** Validates and deduplicates exact origins without silently accepting a partial list. */
export function validateEmbedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) invalid('Expected embed.allowedOrigins array')
  return [...new Set(value.map(validateEmbedOrigin))]
}

/** Resolves one document's policy; invalid present override permits own origin only. */
export function resolveEmbedOrigins(baked: readonly string[], override?: HistoireEmbedOriginOverride): readonly string[] {
  const configured = validateEmbedOrigins(baked)
  if (!override?.present) return configured
  try {
    return validateEmbedOrigins(override.value)
  }
  catch { return [] }
}

/** Framing directive shares exact effective list used by bridge authorization. */
export function createEmbedFrameAncestors(allowedOrigins: readonly string[]): string {
  return ['frame-ancestors \'self\'', ...validateEmbedOrigins(allowedOrigins)].join(' ')
}

/** Replaces only framing directive while preserving independent CSP policies/directives. */
export function mergeEmbedFrameAncestors(existing: string | readonly string[] | undefined, allowedOrigins: readonly string[]): string | string[] {
  const directive = createEmbedFrameAncestors(allowedOrigins)
  const merge = (policy: string) => [...policy.split(';').map(part => part.trim()).filter(part => part && !/^frame-ancestors(?:\s|$)/i.test(part)), directive].join('; ')
  return Array.isArray(existing) ? existing.map(merge) : merge((existing ?? '') as string)
}
