<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useAgentsStore } from '../../../../stores/agents.js'
import { isTypingTarget } from '../../../canvas/pan/useSpacePan.js'
import AgentElicitation from './AgentElicitation.vue'
import AgentPlanApproval from './AgentPlanApproval.vue'

const props = defineProps<{
  /** Thread whose questions render here. */
  threadId: string
}>()
const agents = useAgentsStore()
/** Plan approvals and input requests of this thread. */
const pending = computed(() => agents?.pendingFor(props.threadId) ?? { plans: [], elicitations: [] })
/** Request identities in render order. */
const ids = computed(() => [...pending.value.plans, ...pending.value.elicitations].map(item => item.requestId))
// While mounted, this thread answers its own questions instead of the floating card.
let hide: (() => void) | undefined
watch(() => props.threadId, (id) => {
  hide?.()
  hide = agents?.show(id)
}, { immediate: true })
onBeforeUnmount(() => hide?.())

/** Rendered card root of each request. */
const cards = new Map<string, Element>()
/**
 * Template ref collector keyed by request identity.
 * @param id Request identity.
 * @param instance Card component, null on unmount.
 */
function track(id: string, instance: Element | ComponentPublicInstance | null): void {
  const element = instance && '$el' in instance ? instance.$el as Element : instance as Element | null
  if (element) cards.set(id, element)
  else cards.delete(id)
}

/**
 * Brings a card into view and focuses its primary action: the first form field, else the primary
 * button. Focus stays put while the user types elsewhere so a new question never swallows keystrokes.
 * @param card Card root element.
 */
function reveal(card: Element | undefined): void {
  if (!card?.isConnected) return
  const view = card.ownerDocument.defaultView
  const reduced = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
  if (isTypingTarget(card.ownerDocument.activeElement)) return
  const target = card.querySelector<HTMLElement>('form :is(input, textarea, select):not(:disabled), [data-color="primary"]:not(:disabled)')
  target?.focus({ preventScroll: true })
}

// Reveal questions already pending when the thread opens, then each newly arriving one.
onMounted(() => reveal(cards.get(ids.value[0])))
watch(ids, async (next, previous) => {
  const added = next.filter(id => !previous.includes(id))
  if (!added.length) return
  await nextTick()
  reveal(cards.get(added[0]))
})
</script>

<template>
  <AgentPlanApproval v-for="request in pending.plans" :key="request.requestId" :ref="value => track(request.requestId, value)" :request="request" />
  <AgentElicitation v-for="request in pending.elicitations" :key="request.requestId" :ref="value => track(request.requestId, value)" :request="request" />
</template>
