/** Shared category contract for both compiler adapters and browser rendering. */
export interface CategoryDefinition {
  /** Stable story variant ID. */
  id: string
  /** English label. */
  title: string
  /** v3 resolved theme field. */
  theme: string
  /** Utility stem, without project prefix. */
  stem: string
  /** CSS property identifying generated v4 utilities. */
  property: string
  /** Browser sample rendering behavior. */
  kind: string
}

/** Existing category IDs stay stable; additions follow original categories. */
export const categories: CategoryDefinition[] = [
  ['background-color', 'Background Color', 'backgroundColor', 'bg', 'background-color', 'color'],
  ['text-color', 'Text Color', 'textColor', 'text', 'color', 'text-color'],
  ['border-color', 'Border Color', 'borderColor', 'border', 'border-color', 'border-color'],
  ['padding', 'Padding', 'padding', 'p', 'padding', 'padding'],
  ['margin', 'Margin', 'margin', 'm', 'margin', 'margin'],
  ['font-size', 'Font Size', 'fontSize', 'text', 'font-size', 'text'],
  ['font-weight', 'Font Weight', 'fontWeight', 'font', 'font-weight', 'text'],
  ['font-family', 'Font Family', 'fontFamily', 'font', 'font-family', 'text'],
  ['letter-spacing', 'Letter Spacing', 'letterSpacing', 'tracking', 'letter-spacing', 'text'],
  ['line-height', 'Line Height', 'lineHeight', 'leading', 'line-height', 'text'],
  ['drop-shadow', 'Drop Shadow', 'dropShadow', 'drop-shadow', 'filter', 'box'],
  ['border-radius', 'Border Radius', 'borderRadius', 'rounded', 'border-radius', 'box'],
  ['border-width', 'Border Width', 'borderWidth', 'border', 'border-width', 'border'],
  ['width', 'Width', 'width', 'w', 'width', 'width'],
  ['height', 'Height', 'height', 'h', 'height', 'height'],
  ['box-shadow', 'Box Shadow', 'boxShadow', 'shadow', 'box-shadow', 'box'],
  ['opacity', 'Opacity', 'opacity', 'opacity', 'opacity', 'box'],
  ['breakpoints', 'Breakpoints', 'screens', '', '', 'value'],
  ['z-index', 'Z-index', 'zIndex', 'z', 'z-index', 'value'],
  ['spacing', 'Spacing', 'spacing', 'p', 'padding', 'width'],
].map(([id, title, theme, stem, property, kind]) => ({ id, title, theme, stem, property, kind }))

/** Convert CSS declaration name to Vue inline-style key. */
export function styleProperty(property: string): string {
  return property.startsWith('--') ? property : property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/** Serialize config values without emitting executable functions or losing their existence. */
export function serializableConfig(config: unknown): unknown {
  return JSON.parse(JSON.stringify(config, (_key, value) => typeof value === 'function' ? '[Function]' : value))
}
