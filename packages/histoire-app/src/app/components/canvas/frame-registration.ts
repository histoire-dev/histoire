import type { CanvasFrameRegistration } from '../../composables/canvas-settings.js'

/** Capture one logical activation; A/B/A must never resurrect the first A. */
export function captureFrameRegistration(resolve: () => CanvasFrameRegistration | null | undefined) {
  const registration = resolve()
  if (!registration) return
  return {
    registration,
    /** Object identity changes even when target, session and document all return. */
    isCurrent: () => resolve() === registration,
  }
}
