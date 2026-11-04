/** Shared terminal palette: every colored spot goes through semantic helpers so one color decision governs all output. */

/** Color capability: 0 none, 1 basic 16 colors, 2 256 colors, 3 truecolor. */
export type ColorLevel = 0 | 1 | 2 | 3

/** Environment and stream facts the color decision reads. */
export type ColorEnvironment = Readonly<Record<string, string | undefined>>

/** One color in each capability class. */
interface Hue {
  rgb: readonly [number, number, number]
  ansi256: number
  basic: number
}

/** Histoire brand green. */
const BRAND: Hue = { rgb: [66, 184, 131], ansi256: 79, basic: 32 }

/** Foreground hues of the semantic helpers. */
const HUES = {
  accent: BRAND,
  success: BRAND,
  warn: { rgb: [245, 190, 60], ansi256: 215, basic: 33 },
  error: { rgb: [240, 90, 90], ansi256: 203, basic: 31 },
} as const satisfies Record<string, Hue>

/**
 * Decides the color level. `NO_COLOR`, `FORCE_COLOR=0`, `TERM=dumb` and a non-TTY stream
 * disable color; `FORCE_COLOR` 1/2/3 forces a level even without a TTY.
 * @param environment Process environment.
 * @param isTTY Whether the output stream is a terminal.
 */
export function detectColorLevel(environment: ColorEnvironment = process.env, isTTY: boolean = process.stdout.isTTY === true): ColorLevel {
  const forced = environment.FORCE_COLOR
  if (forced === '0' || forced === 'false') return 0
  if (forced !== undefined && forced !== '' && environment.NO_COLOR === undefined) {
    const level = forced === 'true' ? 1 : Number(forced)
    if (level >= 1) return Math.min(3, Math.trunc(level)) as ColorLevel
  }
  if (environment.NO_COLOR) return 0
  if (!isTTY || environment.TERM === 'dumb') return 0
  if (environment.COLORTERM === 'truecolor' || environment.COLORTERM === '24bit') return 3
  return environment.TERM?.includes('256color') ? 2 : 1
}

/** Foreground escape of a hue at a level. */
function foreground(hue: Hue, level: ColorLevel) {
  if (level === 3) return `38;2;${hue.rgb.join(';')}`
  return level === 2 ? `38;5;${hue.ansi256}` : String(hue.basic)
}

/** Semantic text helpers bound to one color level. */
export interface Style {
  level: ColorLevel
  /** Brand accent. */
  accent: (text: string) => string
  /** Positive state. */
  success: (text: string) => string
  /** Attention state. */
  warn: (text: string) => string
  /** Failure state. */
  error: (text: string) => string
  /** De-emphasized text (attribute, kept without color). */
  dim: (text: string) => string
  /** Emphasized text (attribute, kept without color). */
  bold: (text: string) => string
  /** Shortcut key: bold accent. */
  key: (text: string) => string
  /** Title bar: brand background, inverse video without color. */
  title: (text: string) => string
  /** Hint text `key label · key label`: keys highlighted, the rest dimmed. */
  hints: (text: string) => string
  /** Appends a reset to a styled line so nothing bleeds into the next one. */
  seal: (line: string) => string
}

/** Leading shortcut keys of a hint segment (`Up/Down scroll`, `y copy`, `Esc or q back`). */
const HINT_KEY = /^(?:Up\/Down(?: Home\/End)?|Home\/End|Enter(?: or Esc)?|Esc(?: or q)?|Ctrl\+\w|[A-Za-z/?])(?= )/

/**
 * Builds the palette for a color level. Hues need color; bold, dim and inverse are
 * attributes and stay available so selection and hierarchy survive `NO_COLOR`.
 * @param level Color level; 0 emits no hue.
 * @param attributes Whether bold, dim and inverse are emitted at level 0; `false` makes level 0 fully plain.
 */
export function createStyle(level: ColorLevel, attributes = true): Style {
  const live = level > 0 || attributes
  const wrap = (open: string, close: string) => live ? (text: string) => `\u001B[${open}m${text}\u001B[${close}m` : (text: string) => text
  const hue = (hueName: keyof typeof HUES) => level ? wrap(foreground(HUES[hueName], level), '39') : (text: string) => text
  const dim = wrap('2', '22')
  const bold = wrap('1', '22')
  const accent = hue('accent')
  const key = (text: string) => bold(accent(text))
  const background = level === 3 ? `48;2;${BRAND.rgb.join(';')}` : level === 2 ? `48;5;${BRAND.ansi256}` : `4${BRAND.basic - 30}`
  const title = level ? (text: string) => `\u001B[${background};30;1m${text}\u001B[0m` : wrap('7', '27')
  const hints = !live
    ? (text: string) => text
    : (text: string) => text.split(' · ').map((part) => {
        const match = HINT_KEY.exec(part)
        return match ? `${key(match[0])}${dim(part.slice(match[0].length))}` : dim(part)
      }).join(dim(' · '))
  return {
    level,
    accent,
    success: hue('success'),
    warn: hue('warn'),
    error: hue('error'),
    dim,
    bold,
    key,
    title,
    hints,
    // eslint-disable-next-line no-control-regex -- detects any styling in an already built line
    seal: line => /\u001B\[/.test(line) && !line.endsWith('\u001B[0m') ? `${line}\u001B[0m` : line,
  }
}

/** Palette for the current process environment, evaluated per call so tests can vary it. */
export function defaultStyle(): Style {
  return createStyle(detectColorLevel())
}
