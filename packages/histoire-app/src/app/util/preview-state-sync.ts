import type { Variant } from '../types'
import { applyVariantStateUpdate, createVariantStateSyncGuards, getVariantStateKey } from '@histoire/shared'
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
      return guards.consume(getKey(options.getCurrentVariant()?.id))
    },

    /**
     * Applies preview message to exact target variant.
     */
    applyIncomingState(variantId: string | null | undefined, state: any) {
      return applyVariantStateUpdate({
        storyId: options.getStoryId(),
        variantId,
        state,
        getVariantById: options.getVariantById,
        guards,
      })
    },

    /**
     * Clears all pending suppressions after story reload.
     */
    reset() {
      guards.reset()
    },
  }
}
