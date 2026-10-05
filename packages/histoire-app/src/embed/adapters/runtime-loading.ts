/** Distinguish expected document navigation from recovery of a retained physical sandbox. */
export function createRuntimeLoadRecovery(settings: () => void, version: () => number | null, recover: () => void) {
  let initial = true
  return {
    /** Parent assigned a new src; its matching bootstrap already owns first load. */
    navigate() { initial = true },
    /** Only later loads, or changed intent during navigation, need selection restoration. */
    loaded() {
      settings()
      const current = version()
      if (current === null) return
      if (initial) {
        initial = false
        if (current === 0) return
      }
      recover()
    },
  }
}
