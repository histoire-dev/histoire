import type { ContributionBase } from './base.js'
import type { WorkbenchIcon } from './common.js'
import type { WorkbenchContext } from './context.js'
import type { ContributionView } from './view.js'

/** Rail pane appended after built-in panes. */
export type ShellPaneInput = ContributionBase<WorkbenchContext> & {
  /** Visible label. */
  label: string
  /** Rail icon. */
  icon: WorkbenchIcon
  /** Optional count or short text shown on the rail item. */
  badge?: (context: WorkbenchContext) => string | number | null | undefined
  /**
   * Whether the host renders a title header above the view; defaults to `true`. Set `false` when
   * the view renders its own `WorkbenchPaneHeader` (for example to hold actions).
   */
  header?: boolean
} & ContributionView<WorkbenchContext>

/** Settings section appended after built-in sections. */
export type SettingsSectionInput = ContributionBase<WorkbenchContext> & {
  /** Visible label in settings navigation. */
  label: string
  /** Navigation icon. */
  icon: WorkbenchIcon
} & ContributionView<WorkbenchContext>

/** Home page section appended to one column. */
export type HomeSectionInput = ContributionBase<WorkbenchContext> & {
  /** Column receiving the section. */
  column: 'primary' | 'secondary'
  /** Section heading. */
  title: string
} & ContributionView<WorkbenchContext>

/** Registered rail pane. */
export type ShellPaneContribution = ShellPaneInput & { kind: 'shell.pane' }

/** Registered settings section. */
export type SettingsSectionContribution = SettingsSectionInput & { kind: 'settings.section' }

/** Registered home section. */
export type HomeSectionContribution = HomeSectionInput & { kind: 'home.section' }
