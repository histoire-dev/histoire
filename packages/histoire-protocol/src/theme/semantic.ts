import { parseColor } from './color.js'

/** Default source neutral palette, distinct from authored C1 semantic surfaces. */
export const histoireDefaultNeutralColors = {
  50: '#fafafa',
  100: '#f4f4f5',
  200: '#e4e4e7',
  300: '#d4d4d8',
  400: '#a1a1aa',
  500: '#71717a',
  600: '#52525b',
  700: '#3f3f46',
  750: '#323238',
  800: '#27272a',
  850: '#1f1f21',
  900: '#18181b',
  950: '#101012',
} as const

/** Default source accent palette used by utility colors and project overrides. */
export const histoireDefaultAccentColors = {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  300: '#6ee7b7',
  400: '#34d399',
  500: '#10b981',
  600: '#059669',
  700: '#047857',
  800: '#065f46',
  900: '#064e3b',
} as const

/** Source shade mapping shared by native providers and generated workbench CSS. */
const lightShades = {
  primary: { 'accent': '500', 'accent-soft': '50', 'accent-text': '800', 'accent-link': '700' },
  gray: { canvas: '100', home: '50', surface: '50', border: '200', chip: '100', input: '50', text: '900', body: '700', muted: '500' },
}
/** Dark soft accents retain C1's authored twelve-percent tint. */
const darkShades = {
  primary: { 'accent': '400', 'accent-soft': '400', 'accent-link': '400' },
  gray: { canvas: '950', home: '950', surface: '900', border: '800', chip: '850', input: '950', text: '200', body: '300', muted: '400' },
}

/** Emit customized shades only; resolved default source colors must not replace C1 defaults. */
export function getHistoireSemanticThemeOverrides(colors: Record<string, Record<string, unknown>> = {}, dark = false): Record<string, string> {
  const variables: Record<string, string> = {}
  const shades = dark ? darkShades : lightShades
  for (const color of ['primary', 'gray'] as const) {
    const defaults: Readonly<Record<string, string>> = color === 'primary' ? histoireDefaultAccentColors : histoireDefaultNeutralColors
    for (const [semantic, shade] of Object.entries(shades[color])) {
      const input = colors[color]?.[shade]
      if (!input || !parseColor(input) || input === defaults[shade]) continue
      variables[`--histoire-${semantic}-rgb`] = `var(--_histoire-color-${color}-${shade})`
      if (semantic !== 'accent-soft' || !dark) variables[`--histoire-${semantic}-alpha`] = `var(--_histoire-color-${color}-${shade}-alpha, 1)`
    }
  }
  return variables
}
