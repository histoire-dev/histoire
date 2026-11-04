import type { PanelModel } from './panel.js'
import type { ProgressSnapshot } from './progress/state.js'
import type { TerminalView } from './views/registry.js'

/** Inputs of the panel model that the session owns. */
export interface PanelModelInput {
  version: string
  columns: number
  snapshot: ProgressSnapshot
  url?: string
  segments: Iterable<() => string | undefined>
  feedback?: string
  /** Registered views, in registration order. */
  views: readonly TerminalView[]
}

/** Views whose hints come first (in this order), so a narrow panel drops them last. */
const LEADING_VIEWS: readonly string[] = ['t', 'p']

/**
 * Hint of a registered view.
 * @param view Registered view.
 */
function viewHint(view: TerminalView) {
  return { key: view.shortcut, label: view.title.toLowerCase() }
}

/**
 * Builds the panel model: shortcut hints are the main actions plus registered views,
 * so a view registered by a later slice appears in the panel automatically.
 * @param input Session state.
 */
export function buildPanelModel(input: PanelModelInput): PanelModel {
  const views = input.views
    .filter(view => view.shortcut !== '?' && !view.run)
    .sort((a, b) => LEADING_VIEWS.indexOf(a.shortcut) - LEADING_VIEWS.indexOf(b.shortcut))
  return {
    version: input.version,
    columns: input.columns,
    snapshot: input.snapshot,
    url: input.url,
    segments: [...input.segments].flatMap(provider => provider() ?? []),
    feedback: input.feedback,
    hints: [
      { key: 'o', label: 'open' },
      ...views.filter(view => LEADING_VIEWS.includes(view.shortcut)).map(viewHint),
      { key: 'r', label: 'restart' },
      ...views.filter(view => !LEADING_VIEWS.includes(view.shortcut)).map(viewHint),
      { key: 'y', label: 'copy' },
      { key: 'R', label: 'fresh' },
      { key: 'c', label: 'clear' },
      { key: '?', label: 'help' },
      { key: 'q', label: 'quit' },
    ],
  }
}
