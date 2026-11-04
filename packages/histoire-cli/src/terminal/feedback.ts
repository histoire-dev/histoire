/** Transient one-line feedback (action results) with an expiry. */
export interface Feedback {
  /** Current message; undefined once expired. */
  text: () => string | undefined
  /** Replaces the message and restarts the expiry; notifies. */
  show: (text: string) => void
  /** Drops the message and its timer without notifying. */
  dispose: () => void
}

/** How long feedback stays visible. */
const FEEDBACK_MS = 4000

/**
 * Creates the feedback holder.
 * @param onChange Called when the message appears or expires (repaint).
 */
export function createFeedback(onChange: () => void): Feedback {
  let current: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    text: () => current,
    show(text) {
      clearTimeout(timer)
      current = text
      timer = setTimeout(() => {
        current = undefined
        onChange()
      }, FEEDBACK_MS)
      timer.unref()
      onChange()
    },
    dispose() {
      clearTimeout(timer)
      current = undefined
    },
  }
}
