/** Allowed inline-size range for an accessible panel separator. */
export interface PanelWidthBounds {
  /** Smallest usable width, lowered only when the host cannot fit it. */
  min: number
  /** Largest width that preserves the remaining workspace. */
  max: number
}

/** Default panel widths preserve the approved shell composition. */
export const PANEL_WIDTH_DEFAULT = 280
/** Floating inspector content width; its two 12px insets are separate. */
export const INSPECTOR_WIDTH_DEFAULT = 344
/** Side panes can expand for long test, story and activity names. */
export const PANEL_WIDTH_LIMITS: PanelWidthBounds = { min: 200, max: 520 }
/** Inspector can expand for source and controls without consuming the canvas. */
export const INSPECTOR_WIDTH_LIMITS: PanelWidthBounds = { min: 240, max: 640 }

/** Normalize persisted or requested widths without accepting nonfinite values. */
export function clampPanelWidth(value: unknown, bounds: PanelWidthBounds, fallback: number): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(typeof value === 'number' && Number.isFinite(value) ? value : fallback)))
}

/** Effective widths derive from provider size; shrinking never overwrites preferences. */
export function resolveShellWidths(options: {
  /** Measured provider width; zero means mounting has not measured it yet. */
  containerWidth: number
  /** Narrow hosts use overlays rather than consuming grid columns. */
  narrow: boolean
  /** Only an expanded non-Home side pane consumes workspace. */
  panelVisible: boolean
  /** An applicable and expanded inspector reserves minimum useful width. */
  inspectorVisible: boolean
  /** Preferred side pane inline size. */
  panelWidth: number
  /** Preferred inspector inline size. */
  inspectorWidth: number
}) {
  const width = options.containerWidth > 0 ? options.containerWidth : Number.POSITIVE_INFINITY
  // On tight desktop hosts the inspector may shrink below its preferred minimum;
  // neither pane can consume the last 160px of interactive canvas.
  const reserve = options.inspectorVisible ? INSPECTOR_WIDTH_LIMITS.min + 24 + 160 : 320
  const panelMax = options.narrow
    ? Math.min(PANEL_WIDTH_LIMITS.max, Math.max(0, width - 48))
    : Math.min(PANEL_WIDTH_LIMITS.max, Math.max(0, width - 56 - 160), Math.max(PANEL_WIDTH_LIMITS.min, width - 56 - reserve))
  const panelBounds = { min: Math.min(PANEL_WIDTH_LIMITS.min, panelMax), max: panelMax }
  const panelWidth = clampPanelWidth(options.panelWidth, panelBounds, PANEL_WIDTH_DEFAULT)
  const workspace = options.narrow ? width : width - 56 - (options.panelVisible ? panelWidth : 0)
  const inspectorMax = Math.min(INSPECTOR_WIDTH_LIMITS.max, Math.max(0, workspace - 24 - (options.narrow ? 0 : 160)))
  const inspectorBounds = { min: Math.min(INSPECTOR_WIDTH_LIMITS.min, inspectorMax), max: inspectorMax }
  return { panelWidth, inspectorWidth: clampPanelWidth(options.inspectorWidth, inspectorBounds, INSPECTOR_WIDTH_DEFAULT), panelBounds, inspectorBounds }
}
