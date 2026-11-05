import type { ContributionBase } from './base.js'
import type { WorkbenchIcon } from './common.js'
import type { FrameScopedContext } from './context.js'
import type { ContributionView } from './view.js'

/** Built-in inspector tabs that accept sections. */
export type BuiltinInspectorTab = 'builtin:props' | 'builtin:docs' | 'builtin:events' | 'builtin:tests'

/**
 * Tab a section attaches to: a built-in tab, a qualified plugin tab (`acme:panel`),
 * or `footer` (below every tab, before the Source drawer).
 */
export type InspectorSectionTab = BuiltinInspectorTab | 'footer' | `${string}:${string}`

/** Inspector tab appended after built-in tabs; bound to the selected frame. */
export type InspectorTabInput = ContributionBase<FrameScopedContext> & {
  /** Visible tab label. */
  label: string
  /** Tab icon. */
  icon: WorkbenchIcon
  /** Local or same-plugin qualified command id; the host publishes its qualified identity. */
  primaryCommand?: string
  /** Optional count or short text shown on the tab. */
  badge?: (context: FrameScopedContext) => string | number | null | undefined
} & ContributionView<FrameScopedContext>

/** Section rendered before or after one inspector tab body. */
export type InspectorSectionInput = ContributionBase<FrameScopedContext> & {
  /** Tab receiving the section; unqualified names are rejected. */
  tab: InspectorSectionTab
  /** Placement around the tab body. */
  position: 'before' | 'after'
} & ContributionView<FrameScopedContext>

/** Registered inspector tab. */
export type InspectorTabContribution = InspectorTabInput & { kind: 'inspector.tab' }

/** Registered inspector section. */
export type InspectorSectionContribution = InspectorSectionInput & { kind: 'inspector.section' }
