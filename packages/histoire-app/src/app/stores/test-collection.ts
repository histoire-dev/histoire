import { watch } from 'vue'

/**
 * Recollects tests only when the active story variant exists and the preview
 * iframe has reported itself ready again after a refresh.
 */
export function watchCurrentVariantTestCollection(
  source: () => [string | undefined, string | undefined, boolean | undefined],
  collect: () => Promise<void>,
) {
  return watch(source, async ([storyId, variantId, previewReady]) => {
    if (!storyId || !variantId || !previewReady) {
      return
    }

    await collect()
  }, {
    flush: 'sync',
    immediate: true,
  })
}
