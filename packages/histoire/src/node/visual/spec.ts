import type { HistoireVisualCaptureSpec, HistoireVisualCase } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualSource } from './source.js'
import { stableVisualJson } from './identity.js'

/** Resolve inherited globals once; cases and specs are immutable snapshots. */
export function visualCaptureSpec(source: VisualSource, config: ResolvedVisualConfig, item: HistoireVisualCase, profileId: string): HistoireVisualCaptureSpec {
  const profile = config.profiles.find(value => value.id === profileId)
  if (!profile) {
    throw new Error('Unknown visual profile')
  }
  return JSON.parse(stableVisualJson({ ...profile, globals: profile.globals ?? source.ctx.config.preview?.globals ?? {}, ...(item.propsOverride ? { propsOverride: item.propsOverride } : {}) }))
}
