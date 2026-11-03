import type { HistoireJsonValue } from '@histoire/protocol'
import type { CanvasFrameBadgeInput, CanvasFrameOverlayInput, CanvasOverlayInput, CanvasToolInput, CanvasViewInput } from './canvas.js'
import type { PluginChannel } from './channel.js'
import type { CommandInput, ShortcutInput } from './commands.js'
import type { Awaitable, Disposer } from './common.js'
import type { FrameRef, WorkbenchContext } from './context.js'
import type { WorkbenchContribution } from './contribution.js'
import type { InspectorSectionInput, InspectorTabInput } from './inspector.js'
import type { ContextMenuItemInput, FrameMenuItemInput } from './menus.js'
import type { PluginPreferences } from './preferences.js'
import type { HomeSectionInput, SettingsSectionInput, ShellPaneInput } from './shell.js'
import type { ToolbarItemInput } from './toolbar.js'

/** Frame with this plugin's frame module attached. */
export interface PluginFrameRef extends FrameRef {
  /** Attached actor; a channel opened on this ref reaches exactly this actor. */
  readonly actorId: string
}

/** Same-origin browser window belonging to one currently attached frame actor. */
export interface PluginFrameWindow {
  /** Frame's current window proxy. */
  readonly window: Window
  /** Exact permitted origin of that window. */
  readonly origin: string
  /** Current frame document identity. */
  readonly documentId: string
}

/**
 * API passed to `setup`. Every helper returns a {@link Disposer}; registrations made after
 * setup follow the same ownership and are disposed with the plugin.
 */
export interface WorkbenchPluginApi {
  /** Plugin id. */
  readonly id: string
  /** Browser-visible options from the plugin descriptor. */
  readonly options: HistoireJsonValue | undefined
  /** Root-scoped context; surfaces receive narrower scopes. */
  readonly context: WorkbenchContext
  /** Plugin-scoped JSON preferences. */
  readonly preferences: PluginPreferences
  /** Aborted when the plugin is disposed or its host retires. */
  readonly signal: AbortSignal
  /** Generic registration; the helpers below are typed sugar over it. */
  contribute: (contribution: WorkbenchContribution) => Disposer
  /** Inspector tabs and sections. */
  inspector: {
    /** Adds a tab after built-in tabs. */
    addTab: (tab: InspectorTabInput) => Disposer
    /** Adds a section around a tab body. */
    addSection: (section: InspectorSectionInput) => Disposer
  }
  /** Canvas toolbar. */
  toolbar: {
    /** Adds an item to an overflow group. */
    addItem: (item: ToolbarItemInput) => Disposer
  }
  /** Command search. */
  commands: {
    /** Adds a command. */
    add: (command: CommandInput) => Disposer
  }
  /** Keyboard shortcuts. */
  shortcuts: {
    /** Binds keys to a qualified command id. */
    add: (shortcut: ShortcutInput) => Disposer
  }
  /** Context menus. */
  menus: {
    /** Adds a frame context menu entry. */
    addFrameAction: (item: FrameMenuItemInput) => Disposer
    /** Adds a workbench context menu entry. */
    addContextAction: (item: ContextMenuItemInput) => Disposer
  }
  /** Canvas layers, tools and arrangements. */
  canvas: {
    /** Adds a viewport or canvas overlay. */
    addOverlay: (overlay: CanvasOverlayInput) => Disposer
    /** Adds an overlay instantiated per frame. */
    addFrameOverlay: (overlay: CanvasFrameOverlayInput) => Disposer
    /** Adds a badge to every frame header (counts, statuses). */
    addFrameBadge: (badge: CanvasFrameBadgeInput) => Disposer
    /** Adds a tool to the tool switch. */
    addTool: (tool: CanvasToolInput) => Disposer
    /** Adds an arrangement beside Grid, List and Matrix. */
    addView: (view: CanvasViewInput) => Disposer
  }
  /** Workbench shell rail. */
  shell: {
    /** Adds a rail pane. */
    addPane: (pane: ShellPaneInput) => Disposer
  }
  /** Settings page. */
  settings: {
    /** Adds a settings section. */
    addSection: (section: SettingsSectionInput) => Disposer
  }
  /** Home page. */
  home: {
    /** Adds a home section. */
    addSection: (section: HomeSectionInput) => Disposer
  }
  /** Frames running this plugin's frame module. */
  frames: {
    /** Frames with this plugin attached. */
    list: () => ReadonlyArray<PluginFrameRef>
    /** Opens a channel bound to the exact actor of `frame`. */
    open: (frame: FrameRef) => PluginChannel
    /** Resolves an attached actor's same-origin window, if the host supports it. */
    window: (frame: PluginFrameRef) => PluginFrameWindow | undefined
    /**
     * Observes attach and detach of this plugin's frames (`list()` changed). Released with the
     * plugin; never fires in hosts without frame messaging.
     */
    subscribe: (listener: () => void) => Disposer
  }
  /** Records a diagnostic attributed to this plugin. */
  reportError: (error: unknown) => void
  /**
   * Signals that plugin-internal state read by `badge`, `pressed` or `available` callbacks
   * changed: every surface re-reads them (host subscribers are notified). Registry, context and
   * preference changes already do this. No-op once the plugin retired.
   */
  invalidate: () => void
}

/** Shape accepted by `defineWorkbenchPlugin`. */
export interface WorkbenchPluginDefinition {
  /** Plugin id; must match the descriptor id. */
  readonly id: string
  /** Extension contract version; only `1` exists. */
  readonly apiVersion: 1
  /** Runs once per extension host. Registrations made before it settles commit atomically. */
  readonly setup: (api: WorkbenchPluginApi) => Awaitable<void | Disposer>
}
