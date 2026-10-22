<script setup lang="ts">
import type { UiAgentElicitation } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useAgentsStore } from '../../../../stores/agents.js'
import ElicitationForm from './ElicitationForm.vue'
import ElicitationLink from './ElicitationLink.vue'
import { useExpiryCountdown } from './use-expiry-countdown.js'
import './questions.css'

const props = defineProps<{
  /** Pending agent input request. */
  request: UiAgentElicitation
}>()
const agents = useAgentsStore()
/** Time left, shown only shortly before the request expires. */
const countdown = useExpiryCountdown(() => props.request.expiresAt)
</script>

<template>
  <section class="agent-question" aria-label="Agent question">
    <header>
      <BuiltinIcon :icon="request.mode === 'url' ? 'launch' : 'help'" :size="14" />
      <strong>{{ request.mode === 'form' && request.title ? request.title : 'Input needed' }}</strong>
      <span v-if="countdown" class="question-expiry">Expires in {{ countdown }}</span>
      <HstButton color="flat" icon-only type="button" class="question-dismiss" aria-label="Dismiss" title="Dismiss" @click="agents?.replyElicitation(request.requestId, 'cancel')">
        <BuiltinIcon icon="close" :size="14" />
      </HstButton>
    </header>
    <p class="question-message">
      {{ request.message }}
    </p>
    <ElicitationForm v-if="request.mode === 'form'" :request="request" />
    <ElicitationLink v-else :request="request" />
  </section>
</template>
