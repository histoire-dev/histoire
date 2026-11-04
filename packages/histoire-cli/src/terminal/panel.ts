import type { ProgressSnapshot } from './progress/state.js'
import type { Style } from './style.js'
import { describeProgress, formatDuration } from './progress/format.js'
import { defaultStyle } from './style.js'
import { displayWidth, fitWidth } from './width.js'

/** Fixed height of the pinned panel, so lifecycle changes never move the log area. */
const PANEL_HEIGHT = 3

/** One shortcut hint. */
export interface PanelHint {
  key: string
  label: string
}

/** Everything the panel shows. */
export interface PanelModel {
  version: string
  columns: number
  snapshot: ProgressSnapshot
  /** Workbench address when known. */
  url?: string
  /** Short segments after the address (counts, test activity) from later slices. */
  segments: readonly string[]
  /** Transient feedback replacing the hints line. */
  feedback?: string
  /** Hints in display order; the last two (help, quit) survive narrow widths. */
  hints: readonly PanelHint[]
  /** Palette; defaults to the one the environment allows. */
  style?: Style
}

/** Lifecycle text: real phases and real counts only, never a fabricated percentage. */
function statusText(snapshot: ProgressSnapshot) {
  const description = describeProgress(snapshot)
  if (snapshot.status === 'ready' || snapshot.status === 'failed' || snapshot.status === 'closed') return description
  const prefix = snapshot.status === 'restarting' && description !== 'Restarting' ? 'Restarting · ' : ''
  return `${prefix}${description} · ${formatDuration(snapshot.elapsedMs)}`
}

/**
 * Hint line that fits: when too wide, drops hints from the end but keeps the final two.
 * Fitting works on plain text; keys are highlighted afterwards.
 * @param hints Hints in display order.
 * @param columns Cell budget.
 * @param style Palette.
 */
function hintLine(hints: readonly PanelHint[], columns: number, style: Style) {
  const items = hints.map(hint => `${hint.key} ${hint.label}`)
  const join = (list: string[]) => list.join(' · ')
  while (displayWidth(join(items)) > columns - 1 && items.length > 2) items.splice(items.length - 3, 1)
  const plain = join(items)
  return displayWidth(plain) > columns - 1 ? style.dim(fitWidth(plain, columns - 1)) : style.hints(plain)
}

/** Colors the lifecycle text: ready green, failed red, starting and restarting yellow, closed dim. */
function colorStatus(snapshot: ProgressSnapshot, text: string, style: Style) {
  if (snapshot.status === 'ready') return style.success(text)
  if (snapshot.status === 'failed') return style.bold(style.error(text))
  return snapshot.status === 'closed' ? style.dim(text) : style.warn(text)
}

/**
 * Renders the pinned panel as exactly `PANEL_HEIGHT` lines, each fitted to the width.
 * Title bar is the brand color (inverse video without color); keys are highlighted and
 * labels dimmed; no borders or edge bars.
 * @param model Panel content.
 */
export function renderPanel(model: PanelModel): string[] {
  const { columns } = model
  const style = model.style ?? defaultStyle()
  const header = `${style.title(` Histoire ${model.version} `)} ${colorStatus(model.snapshot, statusText(model.snapshot), style)}`
  const location = model.url
    ? `${style.dim('Local')}  ${style.accent(model.url)}`
    : style.dim('Waiting for address')
  const rest = model.segments.map(segment => style.dim(segment))
  const footer = model.feedback ? model.feedback : hintLine(model.hints, columns, style)
  return [header, ` ${[location, ...rest].join(style.dim(' · '))}`, ` ${footer}`].map(line => style.seal(fitWidth(line, columns)))
}
