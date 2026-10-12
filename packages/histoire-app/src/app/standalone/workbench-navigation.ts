import type { HistoireTarget } from '@histoire/protocol'
import type { ShellPane } from '../stores/shell.js'

/** Rail panes that belong to the workspace rather than a full-page route. */
export type WorkspacePane = Exclude<ShellPane, 'home'>

/** Minimal route operations needed before exposing a workspace pane. */
export interface WorkspacePaneNavigation {
  /** Restores one already-selected story without replaying selection. */
  restore: (target: HistoireTarget) => Promise<unknown>
  /** Opens Home only when no story selection exists to restore. */
  home: () => Promise<unknown>
}

/** Coordinates a rail pane with Settings-exclusive page routing. */
export interface WorkspacePaneActivation {
  /** Workspace pane requested from the app rail. */
  pane: WorkspacePane
  /** Reads the live route after every asynchronous navigation. */
  currentRoute: () => unknown
  /** Reads the canonical selected story and variant, if any. */
  selection: () => HistoireTarget | null
  /** Standalone navigation adapter owned by the current workbench. */
  navigation: WorkspacePaneNavigation
  /** Reveals the requested local pane only after leaving Settings succeeds. */
  showPane: (pane: WorkspacePane) => void
  /** Workspace rail toggle: an already open pane collapses, another pane opens. */
  togglePane: (pane: WorkspacePane) => void
}

/**
 * Leaves Settings before exposing a workspace pane, preventing the pane from
 * being shown beside Settings while preserving the current SDK selection.
 */
export async function activateWorkspacePane(options: WorkspacePaneActivation): Promise<boolean> {
  if (options.currentRoute() === 'settings') {
    const target = options.selection()
    await (target ? options.navigation.restore(target) : options.navigation.home())
    if (options.currentRoute() !== (target ? 'story' : 'home')) {
      throw new Error('Could not leave Settings before opening workspace pane.')
    }
    // Settings hides every pane, so leaving it must always reveal the requested one.
    options.showPane(options.pane)
    return true
  }
  options.togglePane(options.pane)
  return true
}
