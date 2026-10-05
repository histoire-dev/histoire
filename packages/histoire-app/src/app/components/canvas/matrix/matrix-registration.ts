import type { CanvasFrames } from '../../../composables/canvas-settings.js'
import type { CanvasFrameLayout } from '../frame-layout.js'
import { watch } from 'vue'

/** Bind exact base preset ownership while geometry-only updates retain its document. */
export function watchMatrixFrameRegistration(options: {
  /** Canvas registry owned by nearest viewport. */
  registry: CanvasFrames
  /** Current layout can change without changing target. */
  getFrame: () => CanvasFrameLayout
  /** Collected base variant shared by cells. */
  getVariantId: () => string
  /** Current complete displayed cell overrides, independent of its base preset identity. */
  getPropsOverride?: () => Record<string, unknown>
  /** Retire source readiness before replacement target mounts. */
  onTargetChange: () => void
}): () => void {
  let unregister = () => {}
  const stopTarget = watch(() => JSON.stringify([options.getFrame().id, options.getFrame().storyId, options.getVariantId()]), () => {
    options.onTargetChange()
    unregister()
    const frame = options.getFrame()
    unregister = options.registry.registerFrame({ id: frame.id, storyId: frame.storyId, variantId: options.getVariantId(), rect: frame, propsOverride: options.getPropsOverride?.() })
  }, { immediate: true, flush: 'sync' })
  const stopGeometry = watch(options.getFrame, (frame) => {
    const entry = options.registry.getFrame(frame.id)
    if (entry) entry.rect = frame
  }, { flush: 'sync' })
  const stopProps = watch(() => options.getPropsOverride?.(), (value) => {
    const entry = options.registry.getFrame(options.getFrame().id)
    if (entry) entry.propsOverride = value
  }, { deep: true, flush: 'sync' })
  return () => {
    stopTarget()
    stopGeometry()
    stopProps()
    unregister()
  }
}
