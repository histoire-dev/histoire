<script setup lang="ts">
import type { UiAgentStep } from '@histoire/shared'
import { HstPulsatingDisc } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'
import { useAiThreads } from '../../../stores/ai-threads.js'
import { isStepRunning } from './activity-phases.js'

const props = defineProps<{
  /** Live steps of the working reply. */
  steps: readonly UiAgentStep[]
  /** Partial reply text received so far. */
  text: string
  /** Client time the live output started. */
  startedAt?: number
  /** Agent request is queued behind another one. */
  queued?: boolean
  /** Thread identity, to tell when the agent waits for an answer. */
  threadId?: string
}>()
const agents = useAgentsStore()
const threads = useAiThreads()
/** Live plan entry the agent reports working on. */
const planEntry = computed(() => props.threadId ? threads?.streaming.value[props.threadId]?.plan?.find(entry => entry.status === 'in_progress')?.content : undefined)
/** The agent is blocked on a plan approval or input request of this thread. */
const waiting = computed(() => Boolean(props.threadId && agents?.needsInput.value.includes(props.threadId)))
/** Ticks every second while mounted for the elapsed label. */
const now = ref(Date.now())
const timer = setInterval(() => now.value = Date.now(), 1000)
onBeforeUnmount(() => clearInterval(timer))
/** What the agent is doing right now. */
const label = computed(() => {
  if (props.queued) return 'Queued'
  if (waiting.value) return 'Waiting for your input'
  const running = props.steps.findLast(isStepRunning)
  if (running && running.kind !== 'think') return running.title
  // Between tools, the current plan entry says more than a generic "Thinking".
  if (running || !props.text) return planEntry.value ?? 'Thinking'
  return 'Writing response'
})
/** "12s" / "1m 05s" elapsed since the live output started. */
const elapsed = computed(() => {
  if (!props.startedAt) return ''
  const seconds = Math.max(0, Math.floor((now.value - props.startedAt) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
})
</script>

<template>
  <p class="agent-live-tail" role="status">
    <HstPulsatingDisc :size="12" /><span class="label">{{ label }}</span><time v-if="elapsed">{{ elapsed }}</time>
  </p>
</template>

<style scoped>
.agent-live-tail { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 4px 0 0; color: var(--histoire-agent-text); font-size: 11px; }
.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
time { flex: none; color: var(--histoire-muted); }
</style>
