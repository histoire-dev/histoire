import type { HistoireStoryFrame } from '@histoire/protocol'
import type { CanvasStore } from '../../stores/canvas.js'
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
  const size = computed(() => {
    const settings = snapshot.value.settings
    const declared = frame()
    return {
      width: declared?.width ?? (settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth),
      height: declared?.height ?? (settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640),
    }
  })
  return {
    size,
    /** Cache belongs to this source and target, independently of mounted frame lifetime. */
    frameContentSize(variantId: string | null | undefined) {
      const target = { storyId: snapshot.value.selection?.storyId ?? '', variantId }
      const measured = canvas.autoFitContent ? canvas.contentSizes.get(getHistoireTargetKey(target), canvasContentKey(snapshot.value, target)) : undefined
      if (!measured) return size.value
      const declared = frame()
      return { width: declared?.width ?? measured.width, height: declared?.height ?? measured.height }
    },
  }
}
