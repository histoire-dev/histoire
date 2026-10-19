import type { ShallowRef } from 'vue'
import { onMounted } from 'vue'
import { useHistoireContext, useHistoireResource } from './context.js'

/** First-party standalone dialog can reveal owned search before native focus occurs. */
export const HISTOIRE_SEARCH_FOCUS = 'histoire:search-focus'
/** Owned source-frame intent toggles chrome in its exact standalone provider. */
export const HISTOIRE_TOGGLE_UI = 'histoire:toggle-ui'
/** Owned source-frame Escape restores chrome without toggling visible UI off. */
export const HISTOIRE_SHOW_UI = 'histoire:show-ui'

/** Dispatch a finite visibility intent without bubbling into neighboring providers. */
function requestUiVisibility(root: HTMLElement | null, type: typeof HISTOIRE_SHOW_UI | typeof HISTOIRE_TOGGLE_UI): void {
  if (!root) return
  const Event = root.ownerDocument.defaultView?.Event
  if (Event) root.dispatchEvent(new Event(type, { cancelable: true }))
}

/** Dispatch the finite restore intent on its owning provider root. */
export function requestHistoireUiShow(root: HTMLElement | null): void {
  requestUiVisibility(root, HISTOIRE_SHOW_UI)
}

/** Dispatch the finite UI-toggle intent on its owning provider root. */
export function requestHistoireUiToggle(root: HTMLElement | null): void {
  requestUiVisibility(root, HISTOIRE_TOGGLE_UI)
}

/** Owned source-frame intent focuses only this provider's first independent search part. */
export function focusHistoireSearch(root: HTMLElement | null): void {
  if (!root) return
  // The owning shell can reveal an unmounted search pane before native focus.
  // Dispatch directly on this provider so nested or neighboring owners cannot
  // claim the source document's finite search intent.
  const Event = root.ownerDocument.defaultView?.Event
  if (Event && !root.dispatchEvent(new Event(HISTOIRE_SEARCH_FOCUS, { cancelable: true }))) return
  const input = Array.from(root.querySelectorAll<HTMLInputElement>('.histoire-search input[type="search"]')).find(candidate => candidate.closest('.histoire-provider') === root)
  if (input) {
    input.focus()
    input.select()
  }
}

/** Provider-root listener never claims host or nested-provider keyboard input. */
export function useHistoireSearchShortcut(input: ShallowRef<HTMLInputElement | null>): void {
  const context = useHistoireContext()
  let root: HTMLElement | null = null
  /** Native bubbling scope handles only explicit search shortcut; no document listener. */
  function keydown(event: KeyboardEvent) {
    const target = event.target as Element | null
    if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || target?.closest('.histoire-provider') !== root || !input.value) return
    event.preventDefault()
    event.stopPropagation()
    focusHistoireSearch(root)
  }
  onMounted(() => {
    root = context.root.value
    root?.addEventListener('keydown', keydown)
  })
  useHistoireResource(() => {
    root?.removeEventListener('keydown', keydown)
    root = null
  })
}
