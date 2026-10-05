import type { Variant } from '../types.js'
import { unindent } from '@histoire/shared'

/** Source provenance remains runtime-owned; no callback or slot crosses bridge. */
export interface HistoireDynamicSource {
  /** Present text, including intentional empty string. */
  body: string
  /** Choice which produced source text. */
  origin: 'explicit' | 'slot' | 'generated'
}

/** Shared precedence for standalone panel and owning preview; raw file is separate mode. */
export async function getDynamicSourceCode(variant: Variant, generate?: (variant: Variant) => unknown | Promise<unknown>): Promise<HistoireDynamicSource | null> {
  if (typeof variant.source === 'string') return { body: variant.source, origin: 'explicit' }
  const slot = variant.slots?.().source
  const source = slot?.()[0]?.children
  if (typeof source === 'string') return { body: unindent(source), origin: 'slot' }
  const generated = await generate?.(variant)
  return typeof generated === 'string' ? { body: generated, origin: 'generated' } : null
}
