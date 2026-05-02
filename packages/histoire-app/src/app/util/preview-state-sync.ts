import type { Variant } from '../types'
import { applyState, applyVariantStateUpdate, createVariantStateSyncGuards, getVariantStateKey } from '@histoire/shared'
import { STATE_SYNC } from './const'
import { toRawDeep } from './state'

/**
 * Host-side preview state bridge shared by grid and single iframe previews.
 */
export function createPreviewStateSync(options: {
  getStoryId: () => string | null | undefined
  getCurrentVariant: () => Variant | null | undefined
  getVariantById: (variantId: string) => Variant | null | undefined
  postMessage: (payload: {
    type: typeof STATE_SYNC
    variantId: string
    state: any
  }) => void
}) {
  const guards = createVariantStateSyncGuards()
  const pendingPreviewStates = new Map<string, any>()

  /**
   * Returns suppression key for one variant in current story.
   */
  function getKey(variantId?: string | null) {
    return getVariantStateKey(options.getStoryId(), variantId)
  }

  return {
    /**
     * Sends current variant state to preview.
     */
    syncCurrentVariantState() {
      const variant = options.getCurrentVariant()
      if (!variant?.previewReady) {
        return
      }

      const key = getKey(variant.id)
      if (key) {
        pendingPreviewStates.delete(key)
      }

      options.postMessage({
        type: STATE_SYNC,
        variantId: variant.id,
        state: toRawDeep(variant.state, true),
      })
    },

    /**
     * Consumes one pending local echo for current variant.
     */
    shouldSkipCurrentVariantSync() {
      const variant = options.getCurrentVariant()
      const key = getKey(variant?.id)
      const shouldSkip = guards.consume(key)

      if (!shouldSkip && variant && !variant.previewReady && key) {
        pendingPreviewStates.set(key, toRawDeep(variant.state, true))
      }

      return shouldSkip
    },

    /**
     * Applies preview message to exact target variant.
     */
    applyIncomingState(variantId: string | null | undefined, state: any) {
      const variant = applyVariantStateUpdate({
        storyId: options.getStoryId(),
        variantId,
        state,
        getVariantById: options.getVariantById,
        guards,
      })

      const key = getKey(variantId)
      const pendingState = key ? pendingPreviewStates.get(key) : null

      if (variant && pendingState && !variant.previewReady) {
        applyState(variant.state, pendingState)
      }

      return variant
    },

    /**
     * Clears all pending suppressions after story reload.
     */
    reset() {
      guards.reset()
      pendingPreviewStates.clear()
    },
  }
}
