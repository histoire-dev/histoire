import type { Ref } from 'vue'
import { ref } from 'vue'
import { useHistoireControls } from './context'

/** Legacy story-runtime appearance, retained for existing vendor controls entry. */
export const isDark = ref(false)

// Peer build has no import-time browser work or global active theme. Vendor
// controls retain the existing sandbox registry across multiple library copies.
const peerBuild = typeof __HISTOIRE_CONTROLS_PEER__ !== 'undefined' && __HISTOIRE_CONTROLS_PEER__
if (!peerBuild && typeof window !== 'undefined') {
  window.__hst_controls_dark ??= []
  window.__hst_controls_dark.push(isDark)
  window.__hst_controls_dark_ready?.()
}

/** Use provider-owned appearance when native; otherwise preserve story sandbox behavior. */
export function useControlsTheme(): Readonly<Ref<boolean>> {
  return useHistoireControls()?.dark ?? isDark
}
