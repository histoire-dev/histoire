import { nextTick, watch } from 'vue'

/** Restore a removed panel control only when its exact provider still owns lost focus. */
export function watchDismissedPanelFocus(options: {
  /** Current provider root; replacement retires pending handoffs. */
  getRoot: () => HTMLElement | null
  /** Whether a pane is currently rendered. */
  isOpen: () => boolean
  /** Live rail destination for the dismissed pane. */
  getDestination: () => HTMLElement | null
}): () => void {
  let active = true
  let generation = 0
  const stop = watch(options.isOpen, (open, previous) => {
    const token = ++generation
    if (open || !previous) return
    const root = options.getRoot()
    const document = root?.ownerDocument
    const focused = document?.activeElement as HTMLElement | null
    const destination = options.getDestination()
    if (!root || !document || focused?.closest('.histoire-provider') !== root) return
    // Capture before v-if removes the control. Do not steal focus if another
    // control/provider claims it while Vue applies the dismissal.
    void nextTick().then(() => {
      const lost = !document.activeElement || document.activeElement === document.body || document.activeElement === document.documentElement
      if (!active || generation !== token || options.isOpen() || options.getRoot() !== root || !root.isConnected || focused.isConnected || !lost) return
      if (destination?.isConnected && destination.closest('.histoire-provider') === root) destination.focus({ preventScroll: true })
    })
  }, { flush: 'pre' })
  return () => {
    active = false
    generation++
    stop()
  }
}
