import type { CanvasFrameBadgeTone, ExtensionHost, FrameHeaderContext, FrameRef, QualifiedContribution } from '@histoire/plugin-kit'
import type { Ref } from 'vue'
import type { WorkbenchHost } from '../../extensions/create-workbench-host.js'
import { computed, onScopeDispose, ref } from 'vue'
import { useOptionalExtensionHost } from '../../composables/extensions.js'

/** Registered frame header badge. */
type FrameBadgeContribution = QualifiedContribution<'canvas.frame-badge'>

/** Badge ready to render in a frame header. */
export interface FrameBadge {
  /** Qualified contribution id; render key. */
  id: string
  /** Visible text. */
  text: string
  /** Color. */
  tone: CanvasFrameBadgeTone
  /** Tooltip and accessible description. */
  label?: string
}

const TONES = new Set<CanvasFrameBadgeTone>(['neutral', 'accent', 'warning', 'danger'])

/**
 * Evaluates the available header badges of one frame. A throwing badge is reported once and
 * hidden for good, like a throwing inspector tab badge.
 * @param host Extension host.
 * @param context Header context of the frame.
 * @param failed Badges that already threw.
 */
export function evaluateFrameBadges(host: Pick<ExtensionHost, 'available' | 'reportViewError'>, context: FrameHeaderContext, failed: WeakSet<object>): FrameBadge[] {
  const badges: FrameBadge[] = []
  for (const contribution of host.available('canvas.frame-badge', context) as readonly FrameBadgeContribution[]) {
    if (failed.has(contribution)) continue
    try {
      const value = contribution.badge(context)
      if (value === null || value === undefined || value === '') continue
      if (typeof value === 'object') badges.push({ id: contribution.id, text: String(value.text), tone: TONES.has(value.tone!) ? value.tone! : 'neutral', label: value.label })
      else badges.push({ id: contribution.id, text: String(value), tone: 'neutral', label: undefined })
    }
    catch (error) {
      failed.add(contribution)
      host.reportViewError(contribution.id, error, 'update')
    }
  }
  return badges
}

/** Shared per-host revision: one host subscription however many frames render. */
const revisions = new WeakMap<WorkbenchHost, { revision: Ref<number>, failed: WeakSet<object>, users: number, stop?: () => void }>()

/**
 * Header badges of one frame, re-read on registry, context and `api.invalidate()` changes.
 * Empty without an extension host. Must run in a component scope.
 * @param frame Frame identity, read reactively.
 */
export function useFrameBadges(frame: () => FrameRef) {
  const workbench = useOptionalExtensionHost()
  if (!workbench) return computed((): FrameBadge[] => [])
  let shared = revisions.get(workbench)
  if (!shared) revisions.set(workbench, shared = { revision: ref(0), failed: new WeakSet(), users: 0 })
  const state = shared
  if (!state.users++) {
    state.stop = workbench.host.subscribe(() => state.revision.value++)
  }
  onScopeDispose(() => {
    if (!--state.users) state.stop?.()
  })
  return computed(() => {
    void state.revision.value
    if (!workbench.host.contributions('canvas.frame-badge').length) return []
    return evaluateFrameBadges(workbench.host, workbench.frameHeader(frame()), state.failed)
  })
}
