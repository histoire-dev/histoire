import { applyState } from './state.js'

/**
 * Creates stable lookup key for one variant state inside one story.
 */
export function getVariantStateKey(storyId?: string | null, variantId?: string | null) {
  if (!storyId || !variantId) {
    return null
  }

  return `${storyId}:${variantId}`
}

/**
 * Creates per-variant suppression guards used to break state echo loops.
 */
export function createVariantStateSyncGuards() {
  const counts = new Map<string, number>()

  return {
    /**
     * Suppresses next sync event for given variant key.
     */
    suppress(key?: string | null) {
      if (!key) {
        return
      }

      counts.set(key, (counts.get(key) ?? 0) + 1)
    },

    /**
     * Consumes one pending suppression for given variant key.
     */
    consume(key?: string | null) {
      if (!key) {
        return false
      }

      const count = counts.get(key) ?? 0
      if (!count) {
        return false
      }

      if (count === 1) {
        counts.delete(key)
      }
      else {
        counts.set(key, count - 1)
      }

      return true
    },

    /**
     * Clears all pending suppressions.
     */
    reset() {
      counts.clear()
    },
  }
}

/**
 * Applies state update to exact target variant and marks it as locally synced.
 */
export function applyVariantStateUpdate<T extends { state: any }>(options: {
  storyId?: string | null
  variantId?: string | null
  state: any
  getVariantById: (variantId: string) => T | null | undefined
  guards?: ReturnType<typeof createVariantStateSyncGuards>
}) {
  if (!options.variantId) {
    return null
  }

  const variant = options.getVariantById(options.variantId)
  if (!variant) {
    return null
  }

  options.guards?.suppress(getVariantStateKey(options.storyId, options.variantId))
  applyState(variant.state, options.state)
  return variant
}
