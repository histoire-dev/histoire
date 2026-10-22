import type { HstButton } from '@histoire/controls/vue'
import { computed, ref, shallowRef } from 'vue'

/**
 * Open state and anchor of a button that toggles a `PromptMenu`.
 * Bind `trigger` as the button's template ref; `anchor` is its DOM element for positioning.
 */
export function useMenuTrigger() {
  /** Menu is shown. */
  const open = ref(false)
  /** Toggle button instance (template ref). */
  const trigger = shallowRef<InstanceType<typeof HstButton> | null>(null)
  /** Element the menu positions against and returns focus to. */
  const anchor = computed(() => (trigger.value?.element as HTMLElement | undefined) ?? null)
  return {
    open,
    trigger,
    anchor,
    /** Flip the menu from the trigger button. */
    toggle(): void {
      open.value = !open.value
    },
    /** Dismiss the menu. */
    close(): void {
      open.value = false
    },
  }
}
