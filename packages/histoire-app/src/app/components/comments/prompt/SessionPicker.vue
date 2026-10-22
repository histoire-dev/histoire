<script setup lang="ts">
import type { UiAgentConfigOptions, UiCommentAgent, UiCommentSessionOptions } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import AgentLogo from '../../agents/AgentLogo.vue'
import { useMenuTrigger } from './menu-trigger.js'
import { sessionLabel } from './session-labels.js'
import SessionPopover from './SessionPopover.vue'
import SessionSettings from './SessionSettings.vue'

const props = defineProps<{
  /** Usable agents offered by "Switch agent". */
  agents: readonly UiCommentAgent[]
  /** Current destination agent. */
  agentId: string
  /** Destination is bound to the conversation; it cannot be switched. */
  locked?: boolean
  /** Discovered selectors of the current agent. */
  config?: UiAgentConfigOptions
  /** Selectors are still being discovered. */
  loading?: boolean
  /** Explicit choices for this conversation. */
  options?: UiCommentSessionOptions
  /** Disables the chip. */
  disabled?: boolean
}>()
const emit = defineEmits<{
  /** Explicit agent pick. */
  'choose': [id: string]
  'update:options': [value: UiCommentSessionOptions]
}>()
const { open, trigger, anchor, toggle, close } = useMenuTrigger()
const agent = computed(() => props.agents.find(agent => agent.id === props.agentId))
/** Model name (or agent name before discovery), then the effort in effect. */
const label = computed(() => {
  const model = sessionLabel(props.config?.model, props.options?.model) ?? agent.value?.name ?? 'Choose agent'
  const effort = sessionLabel(props.config?.effort, props.options?.effort)
  return effort ? `${model} · ${effort}` : model
})
</script>

<template>
  <HstButton ref="trigger" color="flat" type="button" class="session-chip" aria-haspopup="dialog" :aria-expanded="open" :title="`${agent?.name ?? agentId}: ${label}`" :disabled="disabled" @click="toggle">
    <AgentLogo :icon="agent?.icon" :size="14" /><span class="session-chip-label">{{ label }}</span><BuiltinIcon icon="chevron-down" :size="12" />
  </HstButton>
  <SessionPopover v-if="open" :anchor="anchor" @close="close">
    <SessionSettings :agents="agents" :agent-id="agentId" :locked="locked" :config="config" :loading="loading" :options="options" :disabled="disabled" @choose="emit('choose', $event)" @update:options="emit('update:options', $event)" />
  </SessionPopover>
</template>

<style scoped>
.session-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 200px; padding: 4px 8px; color: var(--histoire-body); font-size: 12px; }
.session-chip > :first-child { flex: none; color: var(--histoire-agent); }
.session-chip > :last-child { flex: none; color: var(--histoire-muted); }
.session-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
