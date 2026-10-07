import type { HistoireSettings, HistoireSettingsPatch } from '@histoire/protocol'
import type { HistoireCatalogStory } from '@histoire/sdk'
import type { CanvasContentInsets } from '../../stores/canvas.js'
import type { CanvasFrameLayout } from './frame-layout.js'
import type { CanvasRect, CanvasSize } from './pan/usePanZoom.js'
import { getHistoireTargetKey } from '@histoire/protocol'

/** Workbench-memory viewport intent; measured pixels never enter saved settings. */
export interface SingleViewportState {
  /** Responsive follows available area; fixed follows user-selected dimensions. */
  mode: 'responsive' | 'fixed'
}

/** Reserve actual chrome and inspector before sizing the native document. */
export function singleVariantArea(viewport: CanvasSize, insets: CanvasContentInsets, inspectorWidth: number, hidden: boolean): CanvasRect {
  const padding = hidden ? 0 : 16
  const top = (insets.topInset ?? 0) + padding
  return { x: padding, y: top, width: Math.max(1, Math.round(viewport.width - inspectorWidth - padding * 2)), height: Math.max(1, Math.round(viewport.height - top - (insets.bottomInset ?? 0) - padding)) }
}

/** Resolve logical dimensions without shrinking oversized presets or scaling content. */
export function resolveSingleViewport(area: CanvasSize, settings: Pick<HistoireSettings, 'responsiveWidth' | 'responsiveHeight' | 'rotate'>, mode: SingleViewportState['mode']): CanvasSize {
  if (mode === 'responsive') return { width: area.width, height: area.height }
  return {
    width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth,
    height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? area.height,
  }
}

/** Convert physical frame dimensions back to rotation-aware persisted settings. */
export function singleViewportSettings(size: CanvasSize, rotate: boolean): HistoireSettingsPatch {
  return rotate
    ? { responsiveWidth: size.height, responsiveHeight: size.width, rotate: true }
    : { responsiveWidth: size.width, responsiveHeight: size.height, rotate: false }
}

/** One exact selected target participates in registry/inspector ownership. */
export function selectedSingleFrame(story: HistoireCatalogStory | undefined, variantId: string | null | undefined, size: CanvasSize): CanvasFrameLayout[] {
  if (!story || !variantId || !story.variants.some(variant => variant.id === variantId)) return []
  return [{ id: getHistoireTargetKey({ storyId: story.id, variantId }), storyId: story.id, variantId, x: 0, y: 0, ...size }]
}
