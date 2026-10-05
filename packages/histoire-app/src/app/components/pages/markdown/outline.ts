import type { Ref } from 'vue'
import type { MarkdownHeading } from './outline-dom.js'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { activeMarkdownHeading, collectMarkdownHeadings, scrollMarkdownHeading } from './outline-dom.js'

/** Outline owns one page's scroll listener and renderer element references. */
export function useMarkdownOutline(root: Ref<HTMLElement | null>) {
  const headings = shallowRef<MarkdownHeading[]>([])
  const active = ref('')
  /** Document content event refreshes anchors after Vue commits rendered HTML. */
  function refresh(): void {
    headings.value = root.value ? collectMarkdownHeadings(root.value) : []
    active.value = root.value ? activeMarkdownHeading(root.value, headings.value) : ''
  }
  /** Follow visible heading within local scrolling page. */
  function scroll(): void {
    if (root.value) active.value = activeMarkdownHeading(root.value, headings.value)
  }
  /** Outline activation never scrolls global host document. */
  function select(heading: MarkdownHeading): void {
    if (!root.value) return
    scrollMarkdownHeading(root.value, heading)
    active.value = heading.id
  }
  const stop = watch(root, (element, previous) => {
    previous?.removeEventListener('scroll', scroll)
    element?.addEventListener('scroll', scroll, { passive: true })
    refresh()
  }, { flush: 'post' })
  onBeforeUnmount(() => {
    stop()
    root.value?.removeEventListener('scroll', scroll)
    headings.value = []
  })
  return { headings, active, refresh, select }
}
