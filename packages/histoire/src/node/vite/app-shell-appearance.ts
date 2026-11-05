import type { HistoireThemeConfig } from '@histoire/shared'
import { startupBackground } from '@histoire/dev-proxy/appearance'

/**
 * Pre-paint script of the workbench app shell.
 *
 * Resolves the color scheme like the app's `useDark` (same storage key, storage
 * and default), then paints the dev proxy startup background as an inline style
 * on `<html>` and sets the app dark class early. The document then never flashes
 * white between the startup page and the mounted workbench.
 * @param theme Project theme options: default scheme and whether it persists.
 */
export function getAppShellAppearanceScript(theme: HistoireThemeConfig): string {
  const storage = theme.storeColorScheme === false ? 'sessionStorage' : 'localStorage'
  const fallback = JSON.stringify(theme.defaultColorScheme ?? 'auto')
  const background = JSON.stringify(startupBackground)
  // Storage may throw (blocked site data); the system preference still applies then.
  return `let s=${fallback};try{s=${storage}.getItem("histoire-color-scheme")||s}catch{}`
    + `const d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);`
    + `const r=document.documentElement,b=${background};`
    + `r.style.backgroundColor=d?b.dark:b.light;r.style.colorScheme=d?"dark":"light";if(d)r.classList.add("htw-dark")`
}

/**
 * Head markup running {@link getAppShellAppearanceScript} before first paint.
 * @param theme Project theme options.
 */
export function renderAppShellAppearance(theme: HistoireThemeConfig): string {
  return `<script>${getAppShellAppearanceScript(theme)}</script>`
}
