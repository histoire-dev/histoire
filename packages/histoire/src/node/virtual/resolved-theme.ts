import type { Context } from '../context.js'
import { parseColor } from '../colors.js'

export function resolvedTheme(ctx: Context) {
  let css = '*, ::before, ::after {'
  // Colors
  const colors = ctx.config.theme.colors as Record<string, Record<string, string> | undefined> | undefined
  for (const color in colors ?? {}) {
    const shades = colors?.[color]
    if (!shades) {
      continue
    }
    for (const key in shades) {
      const parsed = parseColor(shades[key])
      if (parsed) {
        css += `--_histoire-color-${color}-${key}: ${parsed.color.join(' ')};`
      }
    }
  }
  css += '}'
  return css
}
