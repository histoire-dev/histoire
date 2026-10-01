import type { HistoireControlsAppearance } from '@histoire/shared'
import { CONTROLS_APPEARANCE } from '@histoire/shared'

/** Installs panel appearance before custom controls are mounted. */
export function setupControlsDocument(host: Window, onDark: (dark: boolean) => void) {
  document.documentElement.dataset.histoireControls = ''

  /** Accepts explicit theme updates only from the embedding Histoire host. */
  function onMessage(event: MessageEvent) {
    if (event.source !== host || event.origin !== window.location.origin
      || !event.data?.__histoire || event.data.type !== CONTROLS_APPEARANCE) {
      return
    }
    const appearance = event.data.appearance as HistoireControlsAppearance
    for (const [name, value] of Object.entries(appearance.properties)) {
      // Priority also beats globally imported story theme variables.
      document.documentElement.style.setProperty(name, value, 'important')
    }
    document.documentElement.style.colorScheme = appearance.dark ? 'dark' : 'light'
    onDark(appearance.dark)
  }

  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
