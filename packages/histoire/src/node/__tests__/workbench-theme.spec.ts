import type { HistoireConfig } from '@histoire/shared'
import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from '../config/defaults.js'
import { resolvedTheme } from '../virtual/resolved-theme.js'

/** Resolve CSS without starting a Histoire server. */
function resolveTheme(theme?: HistoireConfig['theme']) {
  const config = getDefaultConfig()
  if (theme) config.theme = { ...config.theme, ...theme }
  return resolvedTheme({ config } as Context)
}

describe('workbench theme', () => {
  it('emits palettes and bundled font families by default', () => {
    const css = resolveTheme()
    expect(css).toContain('--_histoire-color-primary-500:')
    expect(css).toContain('--_histoire-color-gray-950:')
    expect(css).toContain('--histoire-font-sans: "Manrope", system-ui, sans-serif;')
    expect(css).toContain('--histoire-font-mono: "JetBrains Mono", ui-monospace, monospace;')
  })

  it('preserves custom accent channels and alpha for both semantic themes', () => {
    const css = resolveTheme({ colors: { primary: { 500: '#123456', 400: '#abcdef80' } } })
    expect(css).toContain('--_histoire-color-primary-500: 18 52 86;')
    expect(css).toContain('--_histoire-color-primary-400: 171 205 239;')
    expect(css).toContain('--_histoire-color-primary-400-alpha: 0.5019607843137255;')
    expect(css).toContain('--histoire-accent-rgb: var(--_histoire-color-primary-500);')
    expect(css).toContain('--histoire-accent-rgb: var(--_histoire-color-primary-400);')
  })

  it('emits independent CSS family overrides', () => {
    const css = resolveTheme({ fonts: { sans: '"Acme Sans", sans-serif' } })
    expect(css).toContain('--histoire-font-sans: "Acme Sans", sans-serif;')
    expect(css).toContain('--histoire-font-mono: "JetBrains Mono", ui-monospace, monospace;')
  })
})
