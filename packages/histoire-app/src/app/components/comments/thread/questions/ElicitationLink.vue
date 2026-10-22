<script setup lang="ts">
import type { UiAgentElicitationUrl } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useAgentsStore } from '../../../../stores/agents.js'

const props = defineProps<{
  /** Pending link request. */
  request: UiAgentElicitationUrl
}>()
const agents = useAgentsStore()
/** Accepted link waiting for the agent to finish. */
const waiting = computed(() => agents?.waiting.value.includes(props.request.requestId) ?? false)
/** Link was just copied; resets after a short delay. */
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))

/** Opens the link only on explicit user action, then tells the agent. */
function open(): void {
  window.open(props.request.url, '_blank', 'noopener,noreferrer')
  agents?.replyElicitation(props.request.requestId, 'accept')
}

/** Copies the link without answering, so the user can open it elsewhere. */
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.request.url)
  }
  catch {
    return
  }
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<template>
  <p class="question-link">
    <span class="question-host">{{ request.host }}</span>
    <HstButton icon-only color="flat" type="button" :aria-label="copied ? 'Copied' : 'Copy link'" :title="copied ? 'Copied' : 'Copy link'" @click="copy">
      <BuiltinIcon :icon="copied ? 'checkmark' : 'copy'" :size="14" />
    </HstButton>
  </p>
  <p v-if="waiting" class="question-status" role="status">
    <HstPulsatingDisc :size="10" />Waiting for completion
  </p>
  <!-- While waiting, the header dismiss button cancels. -->
  <div v-else class="question-actions">
    <HstButton color="flat" type="button" @click="agents?.replyElicitation(request.requestId, 'decline')">
      Decline
    </HstButton>
    <HstButton color="primary" type="button" @click="open">
      Open link
    </HstButton>
  </div>
</template>
