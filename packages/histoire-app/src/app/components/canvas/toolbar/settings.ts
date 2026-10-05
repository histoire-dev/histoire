import type { HistoireSettings, HistoireSettingsPatch } from '@histoire/protocol'

/** Validate user dimensions before mutating canonical preview settings. */
export function parseViewportSize(width: string | number, height: string | number): HistoireSettingsPatch | null {
  const parsedWidth = Number(width)
  const parsedHeight = height === '' ? null : Number(height)
  const valid = (value: number) => Number.isInteger(value) && value >= 1 && value <= 16384
  if (!valid(parsedWidth) || (parsedHeight !== null && !valid(parsedHeight))) return null
  return { responsiveWidth: parsedWidth, responsiveHeight: parsedHeight, rotate: false }
}

/** Physical dimensions reflect rotation; stored dimensions remain logical. */
export function viewportDimensions(settings: Pick<HistoireSettings, 'responsiveWidth' | 'responsiveHeight' | 'rotate'>) {
  return settings.rotate && settings.responsiveHeight !== null
    ? { width: settings.responsiveHeight, height: settings.responsiveWidth }
    : { width: settings.responsiveWidth, height: settings.responsiveHeight }
}

/** Checker presets use existing protocol flags; freeform input permits only hex colors. */
export function backgroundPatch(color: string, checkerboard = false, custom = false): HistoireSettingsPatch | null {
  if (custom && !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) return null
  return { backgroundColor: color === '$checkerboard' ? 'transparent' : color, checkerboard: color === '$checkerboard' || checkerboard }
}
