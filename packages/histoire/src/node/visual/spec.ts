import type { HistoireVisualCaptureSpec, HistoireVisualCase } from '@histoire/shared'
import type { ResolvedVisualConfig } from './config.js'
import type { VisualSource } from './source.js'
import { isHistoireStoryFrameValue } from '@histoire/protocol'
import { CAPTURE_LIMITS } from '../runtime/browser/limits.js'
import { stableVisualJson } from './identity.js'

/** Story layout width and height replace the profile viewport, kept within capture bounds. */
function declaredCaptureSize(source: VisualSource, storyId: string): Partial<Pick<HistoireVisualCaptureSpec, 'width' | 'height'>> {
  const { width, height } = source.ctx.storyFiles.find(file => file.story?.id === storyId)?.story?.layout ?? {}
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))
  return {
    ...(isHistoireStoryFrameValue('width', width) ? { width: clamp(width, CAPTURE_LIMITS.minWidth, CAPTURE_LIMITS.width) } : {}),
    ...(isHistoireStoryFrameValue('height', height) ? { height: clamp(height, CAPTURE_LIMITS.minHeight, CAPTURE_LIMITS.height) } : {}),
  }
}

/** Resolve inherited globals once; cases and specs are immutable snapshots. */
export function visualCaptureSpec(source: VisualSource, config: ResolvedVisualConfig, item: HistoireVisualCase, profileId: string): HistoireVisualCaptureSpec {
  const profile = config.profiles.find(value => value.id === profileId)
  if (!profile) {
    throw new Error('Unknown visual profile')
  }
  return JSON.parse(stableVisualJson({ ...profile, ...declaredCaptureSize(source, item.storyId), globals: profile.globals ?? source.ctx.config.preview?.globals ?? {}, ...(item.propsOverride ? { propsOverride: item.propsOverride } : {}) }))
}
