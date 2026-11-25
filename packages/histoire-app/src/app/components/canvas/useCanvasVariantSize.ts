import type { HistoireStoryFrame } from '@histoire/protocol'
import type { CanvasStore } from '../../stores/canvas.js'
import type { CanvasSize } from './pan/usePanZoom.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { canvasContentKey } from './content-sizes.js'

/**
 * Resolve canonical fallback and source-fenced variant sizes for every ordinary layout.
 * @param canvas Workbench canvas owning fit mode and measured content.
 * @param frame Story-declared geometry; its width and height win over viewport settings and measured content.
 */
export function useCanvasVariantSize(canvas: CanvasStore, frame: () => HistoireStoryFrame | undefined = () => undefined) {
  const snapshot = useHistoireSnapshot()
  const viewport = computed(() => {
    const settings = snapshot.value.settings
    return { width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth, height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640 }
  })
  const size = computed(() => withDeclared(viewport.value))

  /** Declared dimensions replace the matching measured or viewport ones. */
  function withDeclared(value: CanvasSize): CanvasSize {
    const declared = frame()
    return { width: declared?.width ?? value.width, height: declared?.height ?? value.height }
  }

  /** Cache belongs to this source and target, independently of mounted frame lifetime. */
  function measuredSize(variantId: string | null | undefined): CanvasSize | undefined {
    const target = { storyId: snapshot.value.selection?.storyId ?? '', variantId }
    return canvas.autoFitContent ? canvas.contentSizes.get(getHistoireTargetKey(target), canvasContentKey(snapshot.value, target)) : undefined
  }

  return {
    size,
    /** Grid, List and Matrix size: declared dimensions over measured content or the viewport. */
    frameContentSize(variantId: string | null | undefined): CanvasSize {
      const measured = measuredSize(variantId)
      return measured ? withDeclared(measured) : size.value
    },
    /** Single size: measured content or the viewport, ignoring declared dimensions. */
    viewportContentSize(variantId: string | null | undefined): CanvasSize {
      return measuredSize(variantId) ?? viewport.value
    },
  }
}
