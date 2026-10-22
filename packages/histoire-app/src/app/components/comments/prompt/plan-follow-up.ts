import type { UiAgentThreadBase } from '@histoire/shared'
import type { Ref } from 'vue'
import { computed, watch } from 'vue'

/** Composer placeholder once the agent kept planning. */
export const PLAN_FOLLOW_UP_PLACEHOLDER = 'What should change in the plan?'

/**
 * Whether the latest reply ended with "Keep planning"; focuses the composer when such a reply arrives.
 * @param thread Current thread.
 * @param prompt Composer exposing `focus`.
 */
export function usePlanFollowUp(thread: () => UiAgentThreadBase, prompt: Ref<{ focus: () => void } | undefined>) {
  const keptPlanning = computed(() => {
    const last = thread().thread.at(-1)
    return last?.author === 'agent' && last.decisions?.at(-1)?.outcome === 'kept-planning'
  })
  // Only a reply arriving in the open thread takes focus, not opening an old one.
  watch(() => [thread().id, thread().thread.length] as const, ([id, length], [previousId, previousLength]) => {
    if (id === previousId && length > previousLength && keptPlanning.value) prompt.value?.focus()
  }, { flush: 'post' })
  return keptPlanning
}
