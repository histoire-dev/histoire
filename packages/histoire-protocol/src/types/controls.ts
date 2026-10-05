/** Message names shared by the controls sandbox and its host overlay layer. */
export const CONTROLS_APPEARANCE = '__histoire:controls-appearance'
export const CONTROLS_OVERLAY = '__histoire:controls-overlay'
export const CONTROLS_OVERLAY_RESULT = '__histoire:controls-overlay-result'
export const CONTROLS_OVERLAY_REFRESH = '__histoire:controls-overlay-refresh'
/** Finite traversal request when cross-origin boundary prevents local DOM access. */
export const CONTROLS_FOCUS = '__histoire:controls-focus'

/** Finite document-owned preset actions; live values and callbacks never cross wire. */
export type HistoirePresetAction = { action: 'list' } | { action: 'save', label: string } | { action: 'apply' | 'delete', id: string } | { action: 'rename', id: string, label: string }

/** Runtime preset presentation with no serialized state or opaque value owners. */
export interface HistoirePresetList {
  /** At most 1,000 choices owned by exact runtime target/document. */
  items: { id: string, label: string }[]
  /** Saved/applied option, absent for list/delete/rename. */
  selectedId?: string
}

/** Serializable bounds in the controls document's viewport coordinates. */
export interface HistoireControlsRect {
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
  /** Anchor width. */
  width: number
  /** Anchor height. */
  height: number
}

/** Text and identity of an option; its actual value stays in the sandbox. */
export interface HistoireControlsOverlayItem {
  /** Opaque ID returned on selection. */
  id: string
  /** Visible text. */
  label: string
  /** Visible option unavailable for selection. */
  disabled?: boolean
}

/** Host-rendered controls overlays supported by the public adapter. */
export type HistoireControlsOverlay = {
  /** Dropdown with selectable text options. */
  kind: 'select'
  /** Accessible dropdown name. */
  label?: string
  /** Options whose values remain owned by the caller. */
  items: HistoireControlsOverlayItem[]
  /** Currently selected option ID. */
  selectedId?: string
} | {
  /** Non-interactive text tooltip. */
  kind: 'tooltip'
  /** Plain text; never interpreted as HTML. */
  content: string
  /** Preferred side of the anchor. */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Gap between anchor and tooltip. */
  distance?: number
}

/** Host response consumed by the overlay's local callback. */
export interface HistoireControlsOverlayResult {
  /** Present when a dropdown option was selected. */
  itemId?: string
  /** Return keyboard focus to the sandbox anchor. */
  restoreFocus: boolean
  /** Continue keyboard traversal inside the controls form when Tab closes a menu. */
  focusDirection?: 'next' | 'previous'
}

/** A controls overlay request scoped to its originating story and variant. */
export interface HistoireControlsOverlayMessage {
  /** Protocol discriminator. */
  type: typeof CONTROLS_OVERLAY
  /** Originating story ID. */
  storyId: string
  /** Originating variant ID. */
  variantId: string
  /** Unique overlay ID. */
  id: string
  /** Reference bounds within the sandbox viewport. */
  anchor: HistoireControlsRect
  /** Null closes an existing overlay. */
  overlay: HistoireControlsOverlay | null
}

/** Panel appearance copied explicitly into the controls document. */
export interface HistoireControlsAppearance {
  /** Host color scheme. */
  dark: boolean
  /** CSS properties, including theme colors and typography. */
  properties: Record<string, string>
}

/** Appearance update sent by the host. */
export interface HistoireControlsAppearanceMessage {
  /** Protocol discriminator. */
  type: typeof CONTROLS_APPEARANCE
  /** Panel theme and typography. */
  appearance: HistoireControlsAppearance
}

/** Host request to remeasure an overlay's anchor inside its sandbox. */
export interface HistoireControlsOverlayRefreshMessage {
  /** Protocol discriminator. */
  type: typeof CONTROLS_OVERLAY_REFRESH
  /** Target story ID. */
  storyId: string
  /** Target variant ID. */
  variantId: string
  /** Target overlay ID. */
  id: string
}

/** Host reply resolving one local overlay callback. */
export interface HistoireControlsOverlayResultMessage extends HistoireControlsOverlayResult {
  /** Protocol discriminator. */
  type: typeof CONTROLS_OVERLAY_RESULT
  /** Target story ID. */
  storyId: string
  /** Target variant ID. */
  variantId: string
  /** Target overlay ID. */
  id: string
}
