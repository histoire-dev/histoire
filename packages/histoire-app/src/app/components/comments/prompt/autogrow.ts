import type { Ref } from 'vue'
import { nextTick, onMounted, watch } from 'vue'

/**
 * Grow a textarea with its content; CSS `min-height`/`max-height` bound the result
 * and `overflow-y: auto` takes over past the max.
 * @param textarea Field to resize.
 * @param value Current text, watched to trigger resizing.
 */
export function useAutoGrow(textarea: Ref<HTMLTextAreaElement | undefined>, value: () => string): void {
  /** Collapse first so shrinking content reports its real scroll height. */
  function resize(): void {
    const element = textarea.value
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }
  watch(value, () => nextTick(resize))
  onMounted(resize)
}
