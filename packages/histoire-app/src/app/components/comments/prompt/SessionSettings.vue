<script setup lang="ts">
import type { UiAgentConfigOptions, UiCommentAgent, UiCommentSessionOptions } from '@histoire/shared'
import type { PromptMenuItem } from './PromptMenu.vue'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import AgentLogo from '../../agents/AgentLogo.vue'
import { useMenuTrigger } from './menu-trigger.js'
import PromptMenu from './PromptMenu.vue'
import { pickSessionOption, sessionValue } from './session-labels.js'
import SessionRadioList from './SessionRadioList.vue'

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
  /** Disables every control. */
  disabled?: boolean
}>()
const emit = defineEmits<{
  /** Explicit agent pick. */
  'choose': [id: string]
  'update:options': [value: UiCommentSessionOptions]
}>()
const menu = useMenuTrigger()
const agent = computed(() => props.agents.find(agent => agent.id === props.agentId))
const agentItems = computed<PromptMenuItem[]>(() => props.agents.map(agent => ({ id: agent.id, label: agent.name, logo: { icon: agent.icon }, checked: agent.id === props.agentId })))
/** Agent selector with choices, if any. */
function selector(field: keyof UiCommentSessionOptions) {
  const value = props.config?.[field]
  return value?.options.length ? value : undefined
}

/** Record one picked value. */
function pick(field: keyof UiCommentSessionOptions, value: string): void {
  emit('update:options', pickSessionOption(props.options, field, value))
}
/** Switch destination and dismiss the agent menu. */
function switchAgent(id: string): void {
  menu.close()
  emit('choose', id)
}
</script>

<template>
  <div class="session-settings">
    <div class="session-agent">
      <AgentLogo :icon="agent?.icon" :size="16" />
      <strong>{{ agent?.name ?? agentId }}</strong>
      <HstButton v-if="!locked" :ref="(el: any) => menu.trigger.value = el" color="flat" type="button" class="session-switch" aria-label="Switch agent" aria-haspopup="menu" :aria-expanded="menu.open.value" :disabled="disabled" @click="menu.toggle">
        Switch agent<BuiltinIcon icon="chevron-right" :size="12" />
      </HstButton>
      <PromptMenu v-if="menu.open.value" :anchor="menu.anchor.value" label="Agents" :items="agentItems" radio ai @pick="switchAgent" @close="menu.close" />
    </div>
    <p v-if="loading && !config" class="session-note" role="status">
      Loading models…
    </p>
    <SessionRadioList v-if="selector('model')" label="Model" :selector="selector('model')!" :current="sessionValue(selector('model'), options?.model)" :disabled="disabled" @pick="pick('model', $event)" />
    <SessionRadioList v-if="selector('effort')" label="Reasoning effort" :selector="selector('effort')!" :current="sessionValue(selector('effort'), options?.effort)" :disabled="disabled" @pick="pick('effort', $event)" />
    <SessionRadioList v-if="selector('mode')" label="Mode" :selector="selector('mode')!" :current="sessionValue(selector('mode'), options?.mode)" :disabled="disabled" @pick="pick('mode', $event)" />
  </div>
</template>

<style scoped>
.session-settings { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.session-agent { display: flex; align-items: center; gap: 8px; min-width: 0; }
.session-agent > :first-child { flex: none; color: var(--histoire-agent); }
.session-agent strong { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.session-switch { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px; color: var(--histoire-muted); font-size: 12px; }
.session-note { margin: 0; color: var(--histoire-muted); font-size: 12px; }
</style>
