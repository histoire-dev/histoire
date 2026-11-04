import type { ColorLevel } from './style.js'
import { createStyle, detectColorLevel } from './style.js'
import { displayWidth, fitWidth } from './width.js'

/** Zap art rows, each paired with its gradient position (top to bottom). */
const ZAP: readonly string[] = [
  '     ▄███▀',
  '   ▄███▀  ',
  '  ▀▀███▄▄ ',
  '     ▄██▀ ',
  '    ▄█▀   ',
  '   ▀▀     ',
]

/** Gradient stops yellow to amber to green, one per art row, per capability class. */
const GRADIENT = {
  rgb: [[250, 224, 70], [247, 200, 60], [240, 170, 60], [170, 190, 80], [100, 185, 110], [66, 184, 131]],
  ansi256: [227, 221, 215, 149, 78, 79],
  basic: [93, 93, 33, 92, 32, 32],
} as const

/** Cells the art occupies, plus the gap before the text. */
const ART_WIDTH = Math.max(...ZAP.map(row => displayWidth(row)))
const GAP = 2

/** Colors one art row for a level. */
function paint(row: string, index: number, level: ColorLevel) {
  if (!level) return row
  const code = level === 3 ? `38;2;${GRADIENT.rgb[index].join(';')}` : level === 2 ? `38;5;${GRADIENT.ansi256[index]}` : String(GRADIENT.basic[index])
  return `\u001B[${code}m${row}\u001B[39m`
}

/** Options of {@link renderBanner}. */
export interface BannerOptions {
  /** Histoire version, without the leading `v`. */
  version: string
  /** Terminal width. */
  columns: number
  /** `false` or level 0 disables styling; `true` detects the capability (basic at minimum). */
  color: boolean | ColorLevel
  /** Workbench address when already known; without it only the version sits beside the art. */
  url?: string
}

/**
 * Startup banner: a small zap beside the version and address. Lines are at most `columns`
 * cells. A terminal too narrow for the art gets the version line only; with color off the
 * output has no escape sequences at all.
 * @param options Version, width, color decision and optional address.
 */
export function renderBanner(options: BannerOptions): string[] {
  const level: ColorLevel = typeof options.color === 'number' ? options.color : options.color ? Math.max(1, detectColorLevel(process.env, true)) as ColorLevel : 0
  const style = createStyle(level, false)
  const heading = `${style.bold(style.accent('Histoire'))} ${style.dim(`v${options.version}`)}`
  const headingWidth = displayWidth(`Histoire v${options.version}`)
  if (options.columns < ART_WIDTH + GAP + headingWidth) return [style.seal(fitWidth(heading, options.columns))]
  // Text sits beside the middle art rows.
  const text = new Map(options.url ? [[1, heading], [3, `${style.dim('Local')}  ${options.url}`]] : [[2, heading]])
  const budget = options.columns - ART_WIDTH - GAP
  return ZAP.map((row, index) => {
    const line = `${paint(row, index, level)}${' '.repeat(GAP)}${fitWidth(text.get(index) ?? '', budget)}`
    return style.seal(line.trimEnd())
  })
}
