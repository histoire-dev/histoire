import type { Ref } from 'vue'

declare global {
  /** Build-time switch removes legacy browser registration from host Vue build. */
  const __HISTOIRE_CONTROLS_PEER__: boolean
  interface Window {
    __hst_controls_dark: Ref<boolean>[]
    __hst_controls_dark_ready: () => void
  }
}
