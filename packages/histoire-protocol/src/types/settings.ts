/** Existing preview settings, retained for shared/app compatibility. */
export interface PreviewSettings {
  /** Logical viewport width in CSS pixels. */
  responsiveWidth: number
  /** Optional logical viewport height in CSS pixels. */
  responsiveHeight: number | null
  /** Rotate width/height when presenting viewport. */
  rotate: boolean
  /** Preview background CSS color. */
  backgroundColor: string
  /** Show transparent-background checkerboard. */
  checkerboard: boolean
  /** Text direction in isolated story document. */
  textDirection: 'ltr' | 'rtl'
}

/** Host-owned primitive globals delivered reactively to runtime. */
export type HistoireGlobals = Record<string, string | number | boolean | null>

/** Complete session settings; never mutate host document preferences. */
export interface HistoireSettings extends PreviewSettings {
  /** Explicit surface/runtime appearance. */
  colorScheme: 'light' | 'dark' | 'auto'
  /** Per-session theme/design-token globals. */
  globals: HistoireGlobals
}

/** Validated partial preferences update. */
export type HistoireSettingsPatch = Partial<HistoireSettings>

/** Fresh defaults prevent globals shared between sessions. */
export function createDefaultHistoireSettings(): HistoireSettings {
  return { responsiveWidth: 720, responsiveHeight: null, rotate: false, backgroundColor: 'transparent', checkerboard: false, textDirection: 'ltr', colorScheme: 'auto', globals: {} }
}
