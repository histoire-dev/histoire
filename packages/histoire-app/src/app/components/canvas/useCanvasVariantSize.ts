import type { CanvasStore } from '../../stores/canvas.js'
import type { CanvasSize } from './pan/usePanZoom.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { canvasContentKey } from './content-sizes.js'

/**
 * Resolve canonical fallback and source-fenced variant sizes for every ordinary layout.
 * @param canvas Workbench canvas owning fit mode and measured content.
 */
export function useCanvasVariantSize(canvas: CanvasStore) {
  const snapshot = useHistoireSnapshot()
  const viewport = computed(() => {
    const settings = snapshot.value.settings
    return { width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth, height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640 }
  })
  const size = computed(() => {
    const declared = canvas.frameSizeFromCode
    return { width: declared?.width ?? viewport.value.width, height: declared?.height ?? viewport.value.height }
  })

  /** Cache belongs to this source and target, independently of mounted frame lifetime. */
  function measuredSize(variantId: string | null | undefined): CanvasSize | undefined {
    const target = { storyId: snapshot.value.selection?.storyId ?? '', variantId }
    return canvas.autoFitContent ? canvas.contentSizes.get(getHistoireTargetKey(target), canvasContentKey(snapshot.value, target)) : undefined
  }

  return {
    size,
    /** Grid and List size from active content fit, code, or the toolbar viewport. */
    frameContentSize(variantId: string | null | undefined): CanvasSize {
      return measuredSize(variantId) ?? size.value
    },
    /** Single size: measured content or the viewport, ignoring declared dimensions. */
    viewportContentSize(variantId: string | null | undefined): CanvasSize {
      return measuredSize(variantId) ?? viewport.value
    },
  }
}
