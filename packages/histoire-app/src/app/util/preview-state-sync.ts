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
  // Keys whose state watcher already fired once. The first (immediate) firing
  // carries the host's boot snapshot, not a user edit — stashing it would
  // re-apply an empty skeleton over the iframe's boot state, permanently
  // wiping auto-props for vitest-mocked stories (which have no host mount to
  // rebuild them). Deliberately NOT cleared in reset(): the baseline only
  // needs to be established once per variant, while edits made during a later
  // iframe reload must still be stashed.
  const initializedKeys = new Set<string>()

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

      if (key && !initializedKeys.has(key)) {
        // First firing for this variant: baseline snapshot, not an edit.
        initializedKeys.add(key)
        return shouldSkip
      }

      if (!shouldSkip && variant && !variant.previewReady && key) {
        pendingPreviewStates.set(key, toRawDeep(variant.state, true))
      }

      return shouldSkip
    },

    /**
     * Applies preview message to exact target variant.
     */
    applyIncomingState(variantId: string | null | undefined, state: any) {
      // Only the current variant's host watcher ever calls consume(), so only
      // suppress for the current variant. Suppressing a non-current variant (grid
      // mode pushes STATE_SYNC for non-current variants) would leak a suppression
      // that later swallows a genuine local edit on that variant.
      const isCurrentVariant = !!variantId && variantId === options.getCurrentVariant()?.id
      const variant = applyVariantStateUpdate({
        storyId: options.getStoryId(),
        variantId,
        state,
        getVariantById: options.getVariantById,
        guards: isCurrentVariant ? guards : undefined,
      })

      const key = getKey(variantId)
      const pendingState = key ? pendingPreviewStates.get(key) : null

      if (variant && pendingState) {
        // `_hPropDefs` is derived control metadata owned by the running story
        // — never a user edit. The stash captured the host's (possibly empty)
        // skeleton, and the iframe does not re-send defs it considers
        // unchanged, so letting the stash overwrite them would permanently
        // drop the auto-detected controls.
        const { _hPropDefs: _ignored, ...reappliedState } = pendingState
        applyState(variant.state, reappliedState)
        pendingPreviewStates.delete(key!)
        // Runtime snapshot stays canonical. Replay only user-authored patch,
        // never host boot metadata or a full serialized mirror that could erase
        // functions, classes, Maps, or other runtime-only values in the frame.
        options.postMessage({
          type: STATE_SYNC,
          variantId: variant.id,
          state: reappliedState,
        })
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
