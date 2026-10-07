import carbon from './carbon-icons.json' with { type: 'json' }

/** Literal offline glyph used by first-party browser components. */
export interface HistoireIconData {
  /** SVG body supplied by its icon collection. */
  body: string
  /** Coordinate width. */
  width?: number
  /** Coordinate height. */
  height?: number
}

/**
 * Original mdi:tailwind glyph from Material Design Icons (Apache-2.0).
 * Source and license details: tailwind-icon.NOTICE and carbon-icons.LICENSE.
 */
const tailwindLogo: HistoireIconData = {
  width: 24,
  height: 24,
  body: '<path fill="currentColor" d="M12 6c-2.67 0-4.33 1.33-5 4c1-1.33 2.17-1.83 3.5-1.5c.76.19 1.31.74 1.91 1.35c.98 1 2.09 2.15 4.59 2.15c2.67 0 4.33-1.33 5-4c-1 1.33-2.17 1.83-3.5 1.5c-.76-.19-1.3-.74-1.91-1.35C15.61 7.15 14.5 6 12 6m-5 6c-2.67 0-4.33 1.33-5 4c1-1.33 2.17-1.83 3.5-1.5c.76.19 1.3.74 1.91 1.35C8.39 16.85 9.5 18 12 18c2.67 0 4.33-1.33 5-4c-1 1.33-2.17 1.83-3.5 1.5c-.76-.19-1.3-.74-1.91-1.35C10.61 13.15 9.5 12 7 12"/>',
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
  if (name === 'mdi:tailwind') return { ...tailwindLogo }
  const resolved = Object.hasOwn(aliases, name) ? aliases[name] : name.replace(/^carbon:/, '')
  if (!Object.hasOwn(carbon.icons, resolved)) return
  const icon = (carbon.icons as Record<string, HistoireIconData>)[resolved]
  return { width: carbon.width, height: carbon.height, ...icon }
}
