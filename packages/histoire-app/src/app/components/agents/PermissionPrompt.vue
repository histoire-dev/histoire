<script setup lang="ts">
import { getControlElement, HstButton } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAgentsStore } from '../../stores/agents.js'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'
import './agents.css'

/** Provider owns permission authority; static/embedded surfaces omit it. */
const agents = useAgentsStore()
/** Only the oldest live request receives keyboard focus. */
const request = computed(() => agents?.permissions.value[0])
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
      <WorkbenchIcon name="bot" :size="18" />{{ name }} requests permission
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
</template>
