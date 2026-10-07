import type { HistoireSettings } from '@histoire/protocol'
import type { CanvasContentInsets, CanvasStore } from '../../stores/canvas.js'
import type { CanvasSize } from './pan/usePanZoom.js'
import { computed, shallowRef, watch } from 'vue'
import { resolveSingleViewport, singleVariantArea } from './single-viewport.js'

/** Native document geometry stays independent of remembered canvas transforms. */
export function useSingleVariantGeometry(canvas: CanvasStore, options: {
  /** Canonical viewport settings apply only in fixed mode. */
  settings: () => HistoireSettings
  /** Floating inspector reserves this many parent CSS pixels. */
  inspectorWidth: () => number
  /** Hidden chrome leaves full available document area. */
  hidden: () => boolean
}) {
  const insets = shallowRef<CanvasContentInsets>({})
  const area = computed(() => singleVariantArea(canvas.viewport, insets.value, options.inspectorWidth(), options.hidden()))
  const size = computed(() => canvas.singleViewportDraft ?? resolveSingleViewport(area.value, options.settings(), canvas.singleViewport.mode))
  watch([area, size], ([available, logical]) => {
    const measured = canvas.viewport.width > 0 && canvas.viewport.height > 0
    canvas.setSingleGeometry(measured ? available : { width: 0, height: 0 }, logical)
  }, { immediate: true })
  return { area, size,
    /** Publish changed geometry only; frame layout watches cannot trigger a resize loop. */
    measure(viewport: CanvasSize, chrome: CanvasContentInsets): void {
      if (canvas.viewport.width !== viewport.width || canvas.viewport.height !== viewport.height) canvas.viewport = viewport
      canvas.inspectorWidth = options.inspectorWidth()
      if (insets.value.topInset !== chrome.topInset || insets.value.bottomInset !== chrome.bottomInset) insets.value = chrome
    } }
}
