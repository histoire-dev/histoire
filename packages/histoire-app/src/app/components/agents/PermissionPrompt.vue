<script setup lang="ts">
import { BuiltinIcon, getControlElement, HstButton } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAgentsStore } from '../../stores/agents.js'
import { useAiThreads } from '../../stores/ai-threads.js'
import AgentElicitation from '../comments/thread/questions/AgentElicitation.vue'
import AgentPlanApproval from '../comments/thread/questions/AgentPlanApproval.vue'

import './agents.css'

/** Provider owns permission authority; static/embedded surfaces omit it. */
const agents = useAgentsStore()
/** Opens a question's thread where it lives. */
const threads = useAiThreads()
/** Only the oldest live tool request receives keyboard focus. */
const request = computed(() => agents?.tools.value[0])
/** Oldest plan approval or input request whose thread is not on screen. */
const question = computed(() => {
  const offscreen = agents?.offscreen.value
  return offscreen?.plans[0] ?? offscreen?.elicitations[0]
})
/** Agent display name of the floating question. */
const questionAgent = computed(() => agents?.state.value.presets.find(agent => agent.id === question.value?.agentId)?.name ?? 'Agent')
/** Safe display name from current public presets. */
const name = computed(() => agents?.state.value.presets.find(agent => agent.id === request.value?.agentId)?.name ?? 'Agent')
/** Denial is the initial keyboard action for each incoming request. */
const deny = ref<HTMLButtonElement>()
/** Restores the user's workbench focus once pending requests finish. */
let previousFocus: HTMLElement | undefined
/** Restores only a still-connected element after card teardown. */
function restoreFocus(): void {
  previousFocus?.isConnected && previousFocus.focus()
  previousFocus = undefined
}
watch(() => request.value?.requestId, (id) => {
  if (!id) {
    restoreFocus()
    return
  }
  if (typeof document !== 'undefined' && !previousFocus) previousFocus = document.activeElement as HTMLElement
  deny.value?.focus()
}, { flush: 'post' })
onBeforeUnmount(restoreFocus)
</script>

<template>
  <section v-if="request" class="histoire-agent-permission" role="alertdialog" aria-labelledby="histoire-agent-permission-title" aria-describedby="histoire-agent-permission-detail" @keydown.esc.prevent="agents?.reply(request.requestId, false)">
    <h2 id="histoire-agent-permission-title">
      <BuiltinIcon icon="bot" :size="18" />{{ name }} requests permission
    </h2>
    <pre id="histoire-agent-permission-detail">{{ request.detail }}</pre>
    <div class="histoire-agent-permission-actions">
      <HstButton :ref="value => { deny = getControlElement(value) as HTMLButtonElement }" color="flat" type="button" class="histoire-settings-action" @click="agents?.reply(request.requestId, false)">
        Deny
      </HstButton>
      <HstButton color="default" type="button" class="histoire-settings-action" @click="agents?.reply(request.requestId, true, true)">
        Allow for session
      </HstButton>
      <HstButton color="primary" type="button" class="histoire-settings-action" @click="agents?.reply(request.requestId, true)">
        Allow once
      </HstButton>
    </div>
  </section>
  <section v-else-if="question" class="histoire-agent-permission" aria-labelledby="histoire-agent-question-title">
    <header class="histoire-agent-question-header">
      <h2 id="histoire-agent-question-title">
        <BuiltinIcon icon="bot" :size="18" />{{ questionAgent }} is waiting for your input
      </h2>
      <HstButton v-if="threads && question.threadId" color="flat" type="button" @click="threads.reveal(question.threadId)">
        Open thread
      </HstButton>
    </header>
    <AgentPlanApproval v-if="'kind' in question" :request="question" />
    <AgentElicitation v-else :request="question" />
  </section>
</template>
