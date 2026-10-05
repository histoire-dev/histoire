/** Portable parsed CSS color, retaining source mode/alpha for compatible callers. */
export interface HistoireParsedColor {
  /** Supported functional mode. */
  mode: 'rgb' | 'hsl'
  /** Exactly three component values. */
  color: [string, string, string]
  /** Optional CSS number/percentage alpha. */
  alpha?: string
}
const value = '[+-]?(?:\\d+|\\d*\\.\\d+)%?'
const separator = '(?:\\s*,\\s*|\\s+)'
const alpha = `(?:\\s*[,/]\\s*(${value}))?`
const rgb = new RegExp(`^rgba?\\(\\s*(${value})${separator}(${value})${separator}(${value})${alpha}\\s*\\)$`, 'i')
const hue = '[+-]?(?:\\d+|\\d*\\.\\d+)(?:deg|rad|grad|turn)?'
const hsl = new RegExp(`^hsla?\\(\\s*(${hue})${separator}(${value})${separator}(${value})${alpha}\\s*\\)$`, 'i')

/** Dependency-free CSS color parser shared by Node theme output and native providers. */
export function parseColor(input: unknown): HistoireParsedColor | null {
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (text.toLowerCase() === 'transparent') return { mode: 'rgb', color: ['0', '0', '0'], alpha: '0' }
  const expanded = /^#[a-f\d]{3,4}$/i.test(text) ? `#${[...text.slice(1)].map(value => value + value).join('')}` : text
  const hex = expanded.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i)
  if (hex) return { mode: 'rgb', color: hex.slice(1, 4).map(part => Number.parseInt(part, 16).toString()) as HistoireParsedColor['color'], alpha: hex[4] ? (Number.parseInt(hex[4], 16) / 255).toString() : undefined }
  const matched = text.match(rgb) ?? text.match(hsl)
  if (!matched) return null
  return { mode: /^rgb/i.test(text) ? 'rgb' : 'hsl', color: matched.slice(1, 4) as HistoireParsedColor['color'], alpha: matched[4] }
}

/** Convert HSL/percent RGB to numeric RGB channels; CSS alpha remains independent of utility opacity. */
export function getHistoireColorChannels(parsed: HistoireParsedColor): { channels: string, alpha: string } {
  const opacity = parsed.alpha === undefined ? 1 : Number.parseFloat(parsed.alpha) / (parsed.alpha.endsWith('%') ? 100 : 1)
  let channels: number[]
  if (parsed.mode === 'rgb') {
    channels = parsed.color.map(value => Number.parseFloat(value) * (value.endsWith('%') ? 2.55 : 1))
  }
  else {
    const hue = parsed.color[0]
    const unit = hue.match(/(?:deg|rad|grad|turn)$/i)?.[0].toLowerCase()
    const degrees = Number.parseFloat(hue) * (unit === 'rad' ? 180 / Math.PI : unit === 'grad' ? 0.9 : unit === 'turn' ? 360 : 1)
    const normalizedHue = ((degrees % 360) + 360) % 360 / 60
    const saturation = Math.max(0, Math.min(1, Number.parseFloat(parsed.color[1]) / 100))
    const lightness = Math.max(0, Math.min(1, Number.parseFloat(parsed.color[2]) / 100))
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const secondary = chroma * (1 - Math.abs(normalizedHue % 2 - 1))
    const offset = lightness - chroma / 2
    const sectors = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary], [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]]
    channels = sectors[Math.floor(normalizedHue)].map(value => (value + offset) * 255)
  }
  return { channels: channels.map(value => String(Math.round(Math.max(0, Math.min(255, value)) * 1000) / 1000)).join(' '), alpha: String(Math.max(0, Math.min(1, opacity))) }
}
