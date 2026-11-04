import type { TerminalBridge } from '../bridge.js'
import type { ClipboardWriter } from '../clipboard.js'
import type { TerminalKey } from '../keys.js'
import type { LogHistory } from '../output/history.js'
import type { ProgressState } from '../progress/state.js'
import type { RequestHistory } from '../requests/history.js'
import type { RetainedHistories } from '../retained.js'
import type { TestsConsole } from '../tests/console.js'
import { RESERVED_SHORTCUTS } from '../actions.js'

/** Screen size handed to renderers. */
export interface ViewSize {
  columns: number
  rows: number
}

/** A titled block of plain text lines contributed to the session info screen (diagnostics, counts). */
export interface InfoSection {
  title: string
  lines: string[]
}

/** Everything a view may use; views never import each other or reach into the session. */
export interface TerminalViewHost {
  /** Generic command/event bridge to the current runtime generation. Typed wrappers live beside each view's state module. */
  bridge: TerminalBridge
  /** Session log history. */
  logs: LogHistory
  /** Session history of public HTTP exchanges. */
  requests: RequestHistory
  /** Startup progress and restart causes. */
  progress: ProgressState
  /** Public workbench URL when known. */
  url: () => string | undefined
  /** Current terminal size. */
  size: () => ViewSize
  /** One transient feedback line (shown in the main panel after leaving a view, or in the view footer). */
  notify: (text: string) => void
  /** Repaints the active view; call after state changed. No-op when the view is not shown. */
  requestRender: () => void
  /** Returns to the main screen. */
  close: () => void
  /** Leaves the current screen and opens the view registered for a main-screen shortcut; ignored when none is registered. */
  openView: (shortcut: string) => void
  /** Manual test scope, runs, stop and results shared with the main panel and plain commands. */
  tests: TestsConsole
  /** System clipboard. */
  copy: ClipboardWriter
  /** Opens a workbench URL path (resolved against the public address) in the browser. */
  openBrowser: (path?: string) => Promise<void>
  /** Every contracted shortcut with its title and whether a view is registered for it. */
  shortcuts: () => { shortcut: string, title: string, available: boolean }[]
  /** Deletable histories (`x`). Views owning a bounded history register it here so deletion reaches it. */
  retained: RetainedHistories
  /** Base URLs other machines can reach, derived from the configured binding; empty for a loopback-only listener. */
  networkUrls: () => string[]
  /** Adds a titled block to the session info screen; the provider is called on every render and may return undefined. Returns a remover. */
  addInfoSection: (provider: () => InfoSection | undefined) => () => void
  /** Current info sections, in registration order (read by the session info screen). */
  infoSections: () => InfoSection[]
  /** Adds a short text segment to the main panel (counts, test activity). Returns a remover. */
  addPanelSegment: (provider: () => string | undefined) => () => void
}

/**
 * A main-screen shortcut target. A view either owns a full screen (`render` + `handleKey`)
 * or is an instant action (`run`), e.g. clearing retained history.
 */
export interface TerminalView {
  /** Stable unique identifier. */
  id: string
  /** Single printable character that opens the view from the main screen. */
  shortcut: string
  /** Title shown in the screen header and help. */
  title: string
  /** Instant action; when present the view never takes over the screen. */
  run?: () => void
  /** Called when the screen opens. */
  enter?: () => void
  /** Called when the screen closes. */
  leave?: () => void
  /** True while a text prompt (search) needs every key; main keys, `q` and Escape are then not interpreted by the session. */
  capturesInput?: () => boolean
  /** Handles a key; return true when consumed. Unconsumed `Escape` and `q` return to main. */
  handleKey?: (key: TerminalKey) => boolean
  /** Full-screen lines (at most `rows`); the session fits them to the width. */
  render?: (size: ViewSize) => string[]
}

/** Creates a view bound to the session host. Listed once in `views/index.ts`. */
export type TerminalViewFactory = (host: TerminalViewHost) => TerminalView

/** Frozen main-screen shortcut table of the contract: shortcut and the label shown while unavailable. */
export const PLANNED_VIEWS: Readonly<Record<string, string>> = {
  'i': 'Session info',
  'l': 'Logs',
  'e': 'Latest error',
  'n': 'Requests',
  'p': 'Stories',
  't': 'Tests',
  'x': 'Clear history',
  '?': 'Help',
}

/** Registered views keyed by shortcut. */
export interface ViewRegistry {
  /** Adds a view; throws on duplicate id or shortcut, or a shortcut outside the contract table. */
  register: (view: TerminalView) => void
  /** View opened by a main-screen character. */
  byShortcut: (char: string) => TerminalView | undefined
  /** Label of a contracted view that is not registered yet. */
  unavailableLabel: (char: string) => string | undefined
  /** Registered views in registration order. */
  list: () => readonly TerminalView[]
  /** Every contracted shortcut with its title and availability. */
  summary: () => { shortcut: string, title: string, available: boolean }[]
}

/**
 * Creates the registry and instantiates the factories.
 * @param host Host handed to every factory.
 * @param factories View factories, normally the list in `views/index.ts`.
 */
export function createViewRegistry(host: TerminalViewHost, factories: readonly TerminalViewFactory[]): ViewRegistry {
  const views = new Map<string, TerminalView>()
  const register = (view: TerminalView) => {
    if (RESERVED_SHORTCUTS.includes(view.shortcut)) throw new Error(`Shortcut "${view.shortcut}" is reserved by a main action`)
    if (!(view.shortcut in PLANNED_VIEWS)) throw new Error(`Shortcut "${view.shortcut}" is not part of the main key table`)
    if (!view.run && !(view.render && view.handleKey)) throw new Error(`View "${view.id}" needs run, or render and handleKey`)
    if (views.has(view.shortcut) || [...views.values()].some(other => other.id === view.id)) throw new Error(`Duplicate view "${view.id}" or shortcut "${view.shortcut}"`)
    views.set(view.shortcut, view)
  }
  for (const factory of factories) register(factory(host))
  return {
    register,
    byShortcut: char => views.get(char),
    unavailableLabel: char => views.has(char) ? undefined : PLANNED_VIEWS[char],
    list: () => [...views.values()],
    summary: () => Object.entries(PLANNED_VIEWS).map(([shortcut, title]) => ({ shortcut, title: views.get(shortcut)?.title ?? title, available: views.has(shortcut) })),
  }
}
