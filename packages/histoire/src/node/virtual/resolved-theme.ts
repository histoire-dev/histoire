import type { Context } from '../context.js'
import { getHistoireColorChannels, parseColor } from '@histoire/protocol'
import { DEFAULT_THEME_FONTS } from '@histoire/shared'
import { resolvedWorkbenchPalette } from './workbench-palette.js'

/** Emit source palette in RGB channels, preserving HSL/alpha semantics for utility opacity. */
export function resolvedTheme(ctx: Context) {
  let css = '*, ::before, ::after {'
  // Colors
  for (const color in ctx.config.theme?.colors ?? {}) {
    for (const key in ctx.config.theme.colors[color]) {
      const parsed = parseColor(ctx.config.theme.colors[color][key])
      if (!parsed) continue
      const value = getHistoireColorChannels(parsed)
      const name = `--_histoire-color-${color}-${key}`
      css += `${name}: ${value.channels};${name}-alpha: ${value.alpha};`
    }
  }
  css += '}'
  // Keep typography on the workbench root so story documents retain their own fonts.
  css += ':is(.histoire-app,.histoire-workbench,.histoire-root) {'
  for (const family of ['sans', 'mono'] as const) {
    css += `--histoire-font-${family}: ${ctx.config.theme?.fonts?.[family] || DEFAULT_THEME_FONTS[family]};`
  }
  css += '}'
  css += resolvedWorkbenchPalette(ctx.config.theme)
  return css
}
