import type { Ref } from 'vue'
import { onBeforeUnmount, watch } from 'vue'

/** Distance (px) from the bottom still treated as "at the bottom". */
const THRESHOLD = 24

/**
 * Keeps a scroll container pinned to its bottom: when `key` changes (another thread
 * opens) and whenever its content grows (new messages, streamed text, async markdown),
 * unless the user scrolled up to read history.
 * @param container Scrollable element.
 * @param content Element wrapping all scrollable content; its size changes are observed.
 * @param key Identity whose change re-pins to the bottom.
 */
export function useStickToBottom(container: Ref<HTMLElement | undefined>, content: Ref<HTMLElement | undefined>, key: () => unknown): void {
  let stick = true
  /** Scroll to the end when pinned. */
  function pin() {
    const element = container.value
    if (element && stick) element.scrollTop = element.scrollHeight
  }
  /** User scrolling decides whether later growth keeps following. */
  function scrolled() {
    const element = container.value
    if (element) stick = element.scrollHeight - element.scrollTop - element.clientHeight <= THRESHOLD
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(pin)
  watch(key, () => {
    stick = true
    pin()
  }, { flush: 'post' })
  watch([container, content], ([element, inner], [previous, previousInner]) => {
    previous?.removeEventListener('scroll', scrolled)
    if (previousInner) observer?.unobserve(previousInner)
    element?.addEventListener('scroll', scrolled, { passive: true })
    if (inner) observer?.observe(inner)
    pin()
  }, { flush: 'post', immediate: true })
  onBeforeUnmount(() => {
    observer?.disconnect()
    container.value?.removeEventListener('scroll', scrolled)
  })
}
