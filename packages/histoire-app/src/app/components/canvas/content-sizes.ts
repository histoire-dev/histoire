import type { HistoireReadonly, HistoireSnapshot, HistoireTarget } from '@histoire/protocol'
import type { CanvasSize } from './pan/usePanZoom.js'
import { reactive } from 'vue'
import { getCanvasTargetGeneration } from './frame-source.js'

/** One frame can retain only its latest executable source and props projection. */
interface ContentSizeEntry {
  /** Source/target/props identity; never a persisted measurement. */
  key: string
  /** Unscaled, bounded sandbox dimensions. */
  size: CanvasSize
}

/** Scope cached dimensions to exact source, target, and Matrix projection. */
export function canvasContentKey(snapshot: HistoireReadonly<HistoireSnapshot>, target: HistoireTarget, projection?: Record<string, unknown>): string {
  const generation = getCanvasTargetGeneration(snapshot, target)
  return generation ? JSON.stringify([generation, target.storyId, target.variantId, projection ?? null]) : ''
}

/** Workbench-local cache survives virtualization without retaining old source generations. */
export function createCanvasContentSizes() {
  const entries = reactive(new Map<string, ContentSizeEntry>())
  return {
    /** Ignore cached data from replaced sources, variants, or cell overrides. */
    get(frameId: string, key: string): CanvasSize | undefined {
      const entry = entries.get(frameId)
      return key && entry?.key === key ? entry.size : undefined
    },
    /** Publish changed sizes only, preventing geometry/settings feedback loops. */
    set(frameId: string, key: string, size: CanvasSize): void {
      if (!key) return
      const previous = entries.get(frameId)
      if (previous?.key === key && previous.size.width === size.width && previous.size.height === size.height) return
      entries.set(frameId, { key, size: { ...size } })
    },
  }
}
