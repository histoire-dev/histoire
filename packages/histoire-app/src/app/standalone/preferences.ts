import type { HistoireSettings } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk/internal'

/** Standalone alone reads legacy storage; embedded controllers stay memory-only by default. */
export async function restoreStandalonePreferences(session: HistoireSession, window: Window, storeColorScheme: boolean | undefined, signal?: AbortSignal) {
  const sandboxKey = '_histoire-sandbox-settings-v3'
  const colorKey = 'histoire-color-scheme'
  let storage: Storage | undefined
  let colors: Storage | undefined
  try {
    storage = window.localStorage
    colors = storeColorScheme ? storage : window.sessionStorage
  }
  catch { /* Browsing with blocked storage keeps current defaults and runtime functionality. */ }
  try {
    const settings = JSON.parse(storage?.getItem(sandboxKey) ?? '{}')
    const appearance = colors?.getItem(colorKey)
    if (appearance && ['auto', 'light', 'dark'].includes(appearance)) settings.colorScheme = appearance
    await session.settings.update(settings)
  }
  catch { /* Invalid legacy settings do not block book startup. */ }
  // Settings may await a primary runtime. Close during that wait cannot acquire a late observer.
  signal?.throwIfAborted()
  let previous = JSON.stringify(session.getSnapshot().settings)
  return session.subscribe((snapshot) => {
    const current = JSON.stringify(snapshot.settings)
    if (current === previous) return
    previous = current
    try {
      const { responsiveWidth, responsiveHeight, rotate, backgroundColor, checkerboard, textDirection } = snapshot.settings as HistoireSettings
      storage?.setItem(sandboxKey, JSON.stringify({ responsiveWidth, responsiveHeight, rotate, backgroundColor, checkerboard, textDirection }))
      colors?.setItem(colorKey, snapshot.settings.colorScheme)
    }
    catch { /* Storage denial never changes runtime/canonical state ownership. */ }
  })
}
