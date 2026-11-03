import type { CanvasFrameBadgeContribution, CanvasFrameOverlayContribution, CanvasOverlayContribution, CanvasToolContribution, CanvasViewContribution } from './canvas.js'
import type { CommandContribution, ShortcutContribution } from './commands.js'
import type { InspectorSectionContribution, InspectorTabContribution } from './inspector.js'
import type { ContextMenuItemContribution, FrameMenuItemContribution } from './menus.js'
import type { HomeSectionContribution, SettingsSectionContribution, ShellPaneContribution } from './shell.js'
import type { ToolbarItemContribution } from './toolbar.js'

/** Contribution shape for each kind; the single source of contribution kinds. */
export interface ContributionKindMap {
  /** Inspector tab. */
  'inspector.tab': InspectorTabContribution
  /** Section around an inspector tab body. */
  'inspector.section': InspectorSectionContribution
  /** Canvas toolbar item. */
  'toolbar.item': ToolbarItemContribution
  /** Command search entry. */
  'command': CommandContribution
  /** Command keyboard binding. */
  'shortcut': ShortcutContribution
  /** Frame context menu entry. */
  'frame-menu.item': FrameMenuItemContribution
  /** Workbench context menu entry. */
  'context-menu.item': ContextMenuItemContribution
  /** Viewport or canvas overlay. */
  'canvas.overlay': CanvasOverlayContribution
  /** Per-frame overlay. */
  'canvas.frame-overlay': CanvasFrameOverlayContribution
  /** Frame header badge. */
  'canvas.frame-badge': CanvasFrameBadgeContribution
  /** Canvas tool. */
  'canvas.tool': CanvasToolContribution
  /** Canvas arrangement. */
  'canvas.view': CanvasViewContribution
  /** Rail pane. */
  'shell.pane': ShellPaneContribution
  /** Settings section. */
  'settings.section': SettingsSectionContribution
  /** Home section. */
  'home.section': HomeSectionContribution
}

/** Every contribution kind. */
export type ContributionKind = keyof ContributionKindMap

/** Contribution of one kind. */
export type ContributionOfKind<K extends ContributionKind> = ContributionKindMap[K]

/** Any contribution accepted by `api.contribute`. */
export type WorkbenchContribution = ContributionKindMap[ContributionKind]

/**
 * Contribution as exposed by the host registry: `id` is qualified (`acme:panel`,
 * or `builtin:` for built-ins) and ownership is explicit.
 */
export type QualifiedContribution<K extends ContributionKind = ContributionKind> = ContributionOfKind<K> & {
  /** Owning plugin id, or `builtin`. */
  readonly pluginId: string
  /** Id as written by the plugin, before qualification. */
  readonly localId: string
}
