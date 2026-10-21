import type { CanvasStore } from '../../stores/canvas.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { canvasContentKey } from './content-sizes.js'

/** Resolve canonical fallback and source-fenced variant sizes for every ordinary layout. */
export function useCanvasVariantSize(canvas: CanvasStore) {
  const snapshot = useHistoireSnapshot()
  const size = computed(() => {
    const settings = snapshot.value.settings
    return { width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth, height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640 }
  })
  return {
    size,
    /** Cache belongs to this source and target, independently of mounted frame lifetime. */
    frameContentSize(variantId: string | null | undefined) {
      const target = { storyId: snapshot.value.selection?.storyId ?? '', variantId }
      return (canvas.autoFitContent ? canvas.contentSizes.get(getHistoireTargetKey(target), canvasContentKey(snapshot.value, target)) : undefined) ?? size.value
    },
  }
}
