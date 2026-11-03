import type { ActionRun } from './actions.js'
import type { ContributionBase } from './base.js'
import type { WorkbenchIcon } from './common.js'
import type { WorkbenchContext } from './context.js'
import type { ContributionView } from './view.js'

/** Canvas contribution groups; `plugins` trails them before the built-in inspector action. */
export type ToolbarGroup =
  | 'search'
  | 'tools'
  | 'arrange'
  | 'viewport'
  | 'zoom'
  | 'background'
  | 'screenshot'
  | 'embed'
  | 'inspector'
  | 'ui'
  | 'plugins'

/** Fields shared by every toolbar item type. */
type ToolbarItemCommon = ContributionBase<WorkbenchContext> & {
  /** Overflow group receiving the item. */
  group: ToolbarGroup
  /** Accessible name; also used in the overflow menu. */
  label: string
  /** Button icon. */
  icon: WorkbenchIcon
}

/** Fields of button items (action, toggle, popover trigger). */
type ToolbarButtonCommon = ToolbarItemCommon & {
  /**
   * Qualified id of the command this button mirrors (`acme:toggle-grid`). The shortcut bound to
   * that command is shown as the button's hint (tooltip, overflow menu), like built-in toolbar
   * items. Clicking still calls `run` (or opens the popover); the shortcut runs the command.
   */
  command?: string
}

/** Button running an action. */
export type ToolbarActionInput = ToolbarButtonCommon & {
  /** Item type. */
  type: 'action'
  /** Action run on click. */
  run: ActionRun<WorkbenchContext>
}

/** Pressed-state button. */
export type ToolbarToggleInput = ToolbarButtonCommon & {
  /** Item type. */
  type: 'toggle'
  /** Current pressed state, re-read on context and preference changes and `api.invalidate()`. */
  pressed: (context: WorkbenchContext) => boolean
  /** Toggles state on click. */
  run: ActionRun<WorkbenchContext>
}

/** Button opening a popover rendering the view. */
export type ToolbarPopoverInput = ToolbarButtonCommon & {
  /** Item type. */
  type: 'popover'
} & ContributionView<WorkbenchContext>

/** Arbitrary inline control rendered by the view; it owns its own hint, so there is no `command`. */
export type ToolbarCustomInput = ToolbarItemCommon & {
  /** Item type. */
  type: 'custom'
} & ContributionView<WorkbenchContext>

/** Any toolbar item accepted by `api.toolbar.addItem`. */
export type ToolbarItemInput = ToolbarActionInput | ToolbarToggleInput | ToolbarPopoverInput | ToolbarCustomInput

/** Registered toolbar item. */
export type ToolbarItemContribution = ToolbarItemInput & { kind: 'toolbar.item' }
