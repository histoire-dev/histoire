import type { UiScreenshotRequest } from '@histoire/shared'
import { measureWireValue } from '@histoire/shared'
import { toRaw } from 'vue'

/** Capture immutable displayed props before asynchronous transport or lane admission. */
export function snapshotScreenshotTargets(targets: readonly UiScreenshotRequest['targets'][number][]): UiScreenshotRequest['targets'] {
  return targets.map((target) => {
    const result = { storyId: target.storyId, variantId: target.variantId, ...(target.frameKey ? { frameKey: target.frameKey } : {}) }
    if (!target.propsOverride) return result
    const props = toRaw(target.propsOverride)
    measureWireValue(props, { maxBytes: 16 * 1024 })
    return { ...result, propsOverride: JSON.parse(JSON.stringify(props)) }
  })
}
