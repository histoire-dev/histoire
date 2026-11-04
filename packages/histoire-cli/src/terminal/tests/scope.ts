import type { TestTarget } from '../protocol/tests.js'
import type { TestTargetSelection } from '../stories/handoff.js'

/** Scope kinds the Tests view can select, in left/right order. */
export type TestScopeKind = 'all' | 'story' | 'variant'

/** One selectable scope with the exact target it would run, or why it cannot be selected. */
export interface ScopeOption {
  /** Scope kind. */
  scope: TestScopeKind
  /** Short plain label (sanitize before rendering: it may carry story titles). */
  label: string
  /** Whether `r` may run this scope now. */
  available: boolean
  /** Why the scope is disabled. */
  reason?: string
  /** Exact target, only when available. */
  target?: TestTarget
}

/**
 * Builds the three scope options. `All` is always selectable. Story and variant need the
 * target handed over from the stories screen, and that target must belong to the current
 * runtime generation: after a restart it stays visible but unresolved until selected again.
 * @param selection Latest handed-over target.
 * @param generation Current runtime generation.
 */
export function resolveScopeOptions(selection: TestTargetSelection | undefined, generation: string | undefined): ScopeOption[] {
  const all: ScopeOption = { scope: 'all', label: 'All stories', available: true, target: { scope: 'all' } }
  const none = (scope: 'story' | 'variant', reason: string): ScopeOption => ({ scope, label: scope === 'story' ? 'Story' : 'Variant', available: false, reason })
  if (!selection) {
    const reason = 'Select one in Stories and press t'
    return [all, none('story', reason), none('variant', reason)]
  }
  if (selection.generation !== generation) {
    const reason = 'Selected before the last restart, select it again in Stories'
    return [all, { ...none('story', reason), label: selection.storyLabel ?? selection.target.storyId }, { ...none('variant', selection.target.scope === 'variant' ? reason : 'No variant selected'), label: selection.target.scope === 'variant' ? selection.label : 'Variant' }]
  }
  const { target } = selection
  const story: ScopeOption = { scope: 'story', label: selection.storyLabel ?? target.storyId, available: true, target: { scope: 'story', storyId: target.storyId } }
  const variant: ScopeOption = target.scope === 'variant'
    ? { scope: 'variant', label: selection.label, available: true, target }
    : none('variant', 'No variant selected')
  return [all, story, variant]
}
