import type { PreviewSettings } from '@histoire/protocol'
import type { BackgroundPreset } from '@histoire/shared'
import type { CSSProperties } from 'vue'

/** Complete background projection shared by canonical settings and frame overrides. */
export type CanvasBackground = Pick<PreviewSettings, 'backgroundColor' | 'checkerboard' | 'checkerboardTheme'>

/** Fixed inspection palettes, independent of story and workbench color schemes. */
const checkerboards = {
  light: { color: '$checkerboard', label: 'Light checkerboard', base: '#ffffff', alternate: '#e4e4e7', contrastColor: '#18181b' },
  dark: { color: '$checkerboard-dark', label: 'Dark checkerboard', base: '#27272a', alternate: '#3f3f46', contrastColor: '#fafafa' },
} as const

/** Recognizes reserved preset identifiers without treating ordinary colors as patterns. */
export function checkerboardTheme(color: string): CanvasBackground['checkerboardTheme'] {
  if (color === checkerboards.light.color) return 'light'
  if (color === checkerboards.dark.color) return 'dark'
}

/** Preserve solid order and configured labels; provide each built-in pattern once. */
export function withCheckerboardPresets(configured: readonly BackgroundPreset[]): BackgroundPreset[] {
  return [
    ...configured.filter(preset => !checkerboardTheme(preset.color)),
    ...Object.values(checkerboards).map(palette => configured.find(preset => preset.color === palette.color)
      ?? { label: palette.label, color: palette.color, contrastColor: palette.contrastColor }),
  ]
}

/** Identify exactly one selected swatch, including legacy light checkerboards. */
export function getBackgroundPreset(settings: CanvasBackground): string {
  return settings.checkerboard ? checkerboards[settings.checkerboardTheme ?? 'light'].color : settings.backgroundColor
}

/** Paint opaque inspection tiles beneath runtime content at displayed canvas scale. */
export function getBackgroundStyle(settings: CanvasBackground): CSSProperties {
  if (!settings.checkerboard) return { backgroundColor: settings.backgroundColor === 'transparent' ? '#fff' : settings.backgroundColor, backgroundImage: 'none', backgroundSize: undefined }
  const palette = checkerboards[settings.checkerboardTheme ?? 'light']
  return {
    backgroundColor: palette.base,
    backgroundImage: `conic-gradient(${palette.alternate} 25%, ${palette.base} 0 50%, ${palette.alternate} 0 75%, ${palette.base} 0)`,
    backgroundSize: '12px 12px',
  }
}

/** Swatch samples reuse canvas palettes while solid transparency stays unpainted. */
export function getBackgroundPresetStyle(preset: BackgroundPreset): CSSProperties {
  const theme = checkerboardTheme(preset.color)
  return theme
    ? { ...getBackgroundStyle({ backgroundColor: 'transparent', checkerboard: true, checkerboardTheme: theme }), color: preset.contrastColor ?? checkerboards[theme].contrastColor }
    : { backgroundColor: preset.color, backgroundImage: 'none', color: preset.contrastColor }
}

/** Checkerboard is an inspection aid; image exports keep transparent pixels. */
export function getBackgroundCapture(settings: CanvasBackground): string {
  return settings.checkerboard ? '$checkerboard' : settings.backgroundColor
}
