import type { ShallowRef } from 'vue'
import { onMounted } from 'vue'
import { useHistoireContext, useHistoireResource } from './context.js'

/** First-party standalone dialog can reveal owned search before native focus occurs. */
export const HISTOIRE_SEARCH_FOCUS = 'histoire:search-focus'

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
