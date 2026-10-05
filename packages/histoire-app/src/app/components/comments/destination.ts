import type { UiCommentAgent } from '@histoire/shared'
import { computed, ref, watch } from 'vue'

/** Resolve merged agent preferences without treating an implicit choice as consent. */
export function commentDestination(agents: readonly UiCommentAgent[], explicitId?: string): string {
  const usable = agents.filter(agent => !['disabled', 'not-installed', 'error'].includes(agent.state))
  if (explicitId && usable.some(agent => agent.id === explicitId)) return explicitId
  if (usable.some(agent => agent.askEachTime)) return ''
  return usable.find(agent => agent.default)?.id ?? usable[0]?.id ?? ''
}

/** Keep manual choices while following default preferences for each new send. */
export function useCommentDestination(source: () => readonly UiCommentAgent[]) {
  const usable = computed(() => source().filter(agent => !['disabled', 'not-installed', 'error'].includes(agent.state)))
  const agentId = ref('')
  let explicitId: string | undefined
  watch(usable, (agents) => {
    if (!agents.some(agent => agent.id === explicitId)) explicitId = undefined
    agentId.value = commentDestination(agents, explicitId)
  }, { immediate: true })
  return {
    usable,
    agentId,
    /** Only an actual picker action counts as the user's explicit destination. */
    choose(id: string): void {
      explicitId = id
      agentId.value = commentDestination(usable.value, explicitId)
    },
    /** Each new draft or accepted bulk send observes current destination policy. */
    reset(): void {
      explicitId = undefined
      agentId.value = commentDestination(usable.value)
    },
  }
}
