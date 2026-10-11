import type { UiVisualResult } from '@histoire/shared'

/** Color role shared by summary counters, bar segments, and row icons. */
export type VisualTone = 'passed' | 'danger' | 'warn' | 'muted'

/** Glyph, label, and tone per comparison outcome; labels keep missing/error/incompatible distinct. */
export const VISUAL_STATUS: Record<UiVisualResult['status'] | 'stale', { icon: string, label: string, tone: VisualTone }> = {
  stale: { icon: 'renew', label: 'Stale', tone: 'warn' },
  passed: { icon: 'checkmark-filled', label: 'Passed', tone: 'passed' },
  changed: { icon: 'error-filled', label: 'Changed', tone: 'danger' },
  missing: { icon: 'add-alt', label: 'No baseline', tone: 'warn' },
  incompatible: { icon: 'warning-alt-filled', label: 'Incompatible', tone: 'warn' },
  error: { icon: 'error-filled', label: 'Error', tone: 'danger' },
  cancelled: { icon: 'subtract', label: 'Cancelled', tone: 'muted' },
}

/** Approved captures display as passed with their own label. */
export function visualStatus(result: UiVisualResult): { icon: string, label: string, tone: VisualTone } {
  if (result.staleReason) return VISUAL_STATUS.stale
  return result.approved ? { ...VISUAL_STATUS.passed, label: 'Approved' } : VISUAL_STATUS[result.status]
}
