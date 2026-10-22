<script setup lang="ts">
import type { UiAgentPermission } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useAgentsStore } from '../../../../stores/agents.js'
import AgentMarkdown from '../AgentMarkdown.vue'
import './questions.css'

defineProps<{
  /** Pending plan-mode exit request. */
  request: UiAgentPermission
}>()
const agents = useAgentsStore()
</script>

<template>
  <section class="agent-question" aria-label="Plan approval">
    <header>
      <BuiltinIcon icon="list-checked" :size="14" />
      <strong>{{ request.detail.split('\n')[0] || 'Approve plan' }}</strong>
    </header>
    <div class="plan-text">
      <AgentMarkdown :text="request.plan ?? 'The agent wants to start working.'" />
    </div>
    <div class="question-actions">
      <HstButton
        v-for="choice in request.choices ?? []"
        :key="choice.id"
        :color="choice.intent === 'approve' ? 'primary' : 'flat'"
        type="button"
        @click="agents?.reply(request.requestId, choice.intent === 'approve', false, choice.id)"
      >
        {{ choice.label }}
      </HstButton>
    </div>
  </section>
</template>
