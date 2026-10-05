import carbon from './carbon-icons.json' with { type: 'json' }

/** Literal Carbon glyph used by first-party browser components. */
export interface HistoireIconData {
  /** SVG body supplied by Carbon. */
  body: string
  /** Coordinate width. */
  width?: number
  /** Coordinate height. */
  height?: number
}

/** Compatibility names used by older first-party views. */
const aliases: Record<string, string> = {
  'mdi:drag-vertical-variant': 'draggable',
  'mdi:drag-horizontal-variant': 'draggable',
  'fluent:text-paragraph-direction-right-16-regular': 'text-align-left',
  'fluent:text-paragraph-direction-left-16-regular': 'text-align-right',
  'ri:subtract-line': 'subtract',
  'ri:add-line': 'add',
}

/** One canonical offline collection; no Iconify or application dependency. */
export const histoireCarbonIcons = carbon
/** Approved glyph names shared by workbench and built-in controls. */
export const histoireIconNames = Object.keys(carbon.icons)

/** Resolve prefixed, bare, or legacy names without making external requests. */
export function getHistoireIcon(name: string): HistoireIconData | undefined {
  const resolved = Object.hasOwn(aliases, name) ? aliases[name] : name.replace(/^carbon:/, '')
  if (!Object.hasOwn(carbon.icons, resolved)) return
  const icon = (carbon.icons as Record<string, HistoireIconData>)[resolved]
  return { width: carbon.width, height: carbon.height, ...icon }
}
