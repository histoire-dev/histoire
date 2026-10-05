import { computed, shallowRef, watch } from 'vue'
import { clampPanelWidth, INSPECTOR_WIDTH_DEFAULT, INSPECTOR_WIDTH_LIMITS, PANEL_WIDTH_DEFAULT, PANEL_WIDTH_LIMITS, resolveShellWidths } from './shell-widths.js'

/** Local panel identities; home keeps the full workspace available. */
export type ShellPane = 'home' | 'stories' | 'search' | 'tests' | 'comments' | 'mcp'

/** Persisted shell preference stays independent of session selection and URLs. */
export interface ShellState {
  /** Visible rail destination. */
  pane: ShellPane
  /** Whether a side panel is expanded. */
  panelOpen: boolean
  /** Whether story inspector is visible. */
  inspectorOpen: boolean
  /** Preferred side pane width, retained through responsive changes. */
  panelWidth: number
  /** Preferred inspector width, independent of pane visibility. */
  inspectorWidth: number
}

/** Standalone persistence key; obsolete split-pane keys are never read. */
export const SHELL_STORAGE_KEY = '_histoire-ui-shell'

/** Available client storage; adapters can replace browser persistence. */
export type ShellStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Modes filter unavailable persisted and user-requested destinations alike. */
export function isShellPane(value: unknown, dev: boolean): value is ShellPane {
  return typeof value === 'string' && (['home', 'stories', 'search'].includes(value) || (dev && ['tests', 'comments', 'mcp'].includes(value)))
}

/** Each mounted workbench owns one small store; no active Pinia/session globals. */
export function createShell(options: {
  /** Dev builds expose tests, comments, and MCP. */
  dev: boolean
  /** Optional explicit persistence service, usually caller document storage. */
  storage?: ShellStorage
}) {
  const state = shallowRef<ShellState>({ pane: 'stories', panelOpen: true, inspectorOpen: true, panelWidth: PANEL_WIDTH_DEFAULT, inspectorWidth: INSPECTOR_WIDTH_DEFAULT })
  const narrow = shallowRef(false)
  const containerWidth = shallowRef(0)
  const inspectorAvailable = shallowRef(false)
  const widths = computed(() => resolveShellWidths({ containerWidth: containerWidth.value, narrow: narrow.value, panelVisible: state.value.panelOpen && state.value.pane !== 'home', inspectorVisible: inspectorAvailable.value && state.value.inspectorOpen, panelWidth: state.value.panelWidth, inspectorWidth: state.value.inspectorWidth }))
  let storage: ShellStorage | undefined
  let closed = false
  /** Publish one immutable record so persistence never sees half an action. */
  function update(value: Partial<ShellState>): void {
    if (!closed) state.value = { ...state.value, ...value }
  }
  /** Storage errors leave a usable shell in private/restricted browser contexts. */
  function persist(): void {
    try {
      storage?.setItem(SHELL_STORAGE_KEY, JSON.stringify(state.value))
    }
    catch { /* Preference persistence is optional. */ }
  }
  const stop = watch(state, persist, { flush: 'sync' })
  /** Attach caller storage once and normalize unavailable or malformed state. */
  function restore(value: ShellStorage): void {
    if (closed || storage) return
    let saved: Partial<ShellState> = {}
    try {
      const parsed: unknown = JSON.parse(value.getItem(SHELL_STORAGE_KEY) ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed
    }
    catch { /* Malformed preferences are replaced by current defaults. */ }
    storage = value
    const pane = isShellPane(saved.pane, options.dev) ? saved.pane : 'stories'
    update({
      pane,
      panelOpen: pane !== 'home' && (typeof saved.panelOpen === 'boolean' ? saved.panelOpen : true),
      inspectorOpen: typeof saved.inspectorOpen === 'boolean' ? saved.inspectorOpen : true,
      panelWidth: clampPanelWidth(saved.panelWidth, PANEL_WIDTH_LIMITS, PANEL_WIDTH_DEFAULT),
      inspectorWidth: clampPanelWidth(saved.inspectorWidth, INSPECTOR_WIDTH_LIMITS, INSPECTOR_WIDTH_DEFAULT),
    })
  }
  /** Active panel buttons collapse; changing panels always reveals the new one. */
  function selectPane(pane: ShellPane): void {
    if (!isShellPane(pane, options.dev)) return
    update({ pane, panelOpen: pane !== 'home' && (state.value.pane !== pane || !state.value.panelOpen) })
  }
  /** Reopening from home restores stories as a useful default panel. */
  function togglePanel(): void {
    update(state.value.pane === 'home' ? { pane: 'stories', panelOpen: true } : { panelOpen: !state.value.panelOpen })
  }
  /** Closing inspector keeps its content selection intact. */
  function toggleInspector(): void {
    update({ inspectorOpen: !state.value.inspectorOpen })
  }
  /** Container width, rather than global window, defines narrow fallback. */
  function setNarrow(width: number): void {
    if (!closed && Number.isFinite(width) && width > 0) {
      containerWidth.value = width
      narrow.value = width <= 640
    }
  }
  /** Story routes reserve inspector space; Home and Markdown retain full workspace. */
  function setInspectorAvailable(value: boolean): void {
    if (!closed) inspectorAvailable.value = value
  }
  /** Resize only the pane preference while retaining every other shell choice. */
  function setPanelWidth(value: number): void {
    if (Number.isFinite(value)) update({ panelWidth: clampPanelWidth(value, widths.value.panelBounds, state.value.panelWidth) })
  }
  /** Resize inspector independently, within the current provider workspace. */
  function setInspectorWidth(value: number): void {
    if (Number.isFinite(value)) update({ inspectorWidth: clampPanelWidth(value, widths.value.inspectorBounds, state.value.inspectorWidth) })
  }
  /** Narrow selection dismisses overlay; desktop selection preserves panel. */
  function closePanelAfterSelection(): void {
    if (narrow.value) update({ panelOpen: false })
  }
  /** Retire persistence and ignore actions after caller teardown. */
  function close(): void {
    if (closed) return
    closed = true
    stop()
    storage = undefined
  }
  if (options.storage) restore(options.storage)
  return {
    /** Current panel preference. */
    pane: computed(() => state.value.pane),
    /** Current panel visibility preference. */
    panelOpen: computed(() => state.value.panelOpen),
    /** Current inspector visibility preference. */
    inspectorOpen: computed(() => state.value.inspectorOpen),
    /** Current container responsive state. */
    narrow: computed(() => narrow.value),
    /** Effective pane width within the measured provider. */
    panelWidth: computed(() => widths.value.panelWidth),
    /** Effective inspector width within the available workspace. */
    inspectorWidth: computed(() => widths.value.inspectorWidth),
    /** Dynamic accessible range of the side pane separator. */
    panelWidthBounds: computed(() => widths.value.panelBounds),
    /** Dynamic accessible range of the inspector separator. */
    inspectorWidthBounds: computed(() => widths.value.inspectorBounds),
    /** Build capability used by rail descriptors. */
    dev: options.dev,
    selectPane,
    togglePanel,
    toggleInspector,
    setNarrow,
    setInspectorAvailable,
    setPanelWidth,
    setInspectorWidth,
    closePanelAfterSelection,
    restore,
    close,
  }
}

/** Injection contract can be backed by another per-session adapter. */
export type ShellStore = ReturnType<typeof createShell>
