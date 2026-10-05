import type { HistoireControlsAppearance } from '@histoire/shared'

/** Copy owning panel presentation without child DOM or global theme mutation. */
export function getControlsAppearance(element: HTMLElement, dark: boolean, colors: Record<string, Record<string, unknown>> = {}): HistoireControlsAppearance {
  const window = element.ownerDocument.defaultView!
  const style = window.getComputedStyle(element)
  let background = 'transparent'
  for (let surface: HTMLElement | null = element; surface; surface = surface.parentElement) {
    const color = window.getComputedStyle(surface).backgroundColor
    if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
      background = color
      break
    }
  }
  const properties: Record<string, string> = {
    '--histoire-controls-background': background,
    '--histoire-controls-foreground': style.color,
    '--histoire-controls-font-family': style.fontFamily,
    '--histoire-controls-font-size': style.fontSize,
    '--histoire-controls-line-height': style.lineHeight,
  }
  for (const name of ['surface', 'input', 'border', 'chip', 'text', 'muted', 'accent', 'accent-soft', 'accent-foreground', 'danger', 'font-sans', 'font-mono', 'control-height', 'control-padding', 'control-wrapper-padding', 'control-gap', 'control-margin', 'control-surface', 'control-input', 'control-border', 'control-chip', 'control-text', 'control-muted', 'control-accent', 'control-accent-soft', 'control-on-accent', 'control-danger']) {
    const key = `--histoire-${name}`
    const value = style.getPropertyValue(key)
    if (value.trim()) properties[key] = value
  }
  for (const [color, shades] of Object.entries(colors)) {
    for (const shade of Object.keys(shades)) {
      const name = `--_histoire-color-${color}-${shade}`
      properties[name] = style.getPropertyValue(name)
      properties[`${name}-alpha`] = style.getPropertyValue(`${name}-alpha`)
    }
  }
  return { dark, properties }
}
