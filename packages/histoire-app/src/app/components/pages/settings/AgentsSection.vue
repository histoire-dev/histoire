<script setup lang="ts">
import type { UiAgentSettings } from '@histoire/shared'
import { HstButton, HstButtonGroup, HstSwitch } from '@histoire/controls/vue'
import { ACP_PRESETS } from '@histoire/shared'
import { computed, shallowRef } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'
import { histoireConfig } from '../../../util/config.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import AgentPresetRow from './AgentPresetRow.vue'
import SaveToProject from './SaveToProject.vue'
import './agents-settings.css'

/** Provider owns safe development-only user preferences. */
const agents = useAgentsStore()
/** Snapshot remains authoritative until server confirms each command. */
const state = computed(() => agents?.state.value)
/** Project save/reset baseline explicitly excludes private env values. */
const projectPresets = shallowRef<UiAgentSettings['presets']>(histoireConfig.agents?.presets?.length ? histoireConfig.agents.presets.map(({ env: _env, ...preset }) => preset) : ACP_PRESETS)
/** Shared project defaults are distinct from local user policy. */
const projectPermissions = shallowRef<UiAgentSettings['permissions']>({ fileEdits: 'ask', terminal: 'ask', ...histoireConfig.agents?.permissions })
/** Available edit policies reflect declared ACP tool categories/locations. */
const filePolicies = [{ value: 'ask', label: 'Ask' }, { value: 'allow-src', label: 'Allow in src/' }, { value: 'never', label: 'Never' }]
/** Terminal execution stays agent-owned. */
const terminalPolicies = [{ value: 'ask', label: 'Ask' }, { value: 'allow', label: 'Allow' }, { value: 'never', label: 'Never' }]
/** Scoped information attached to comment prompts. */
const contextOptions = [
  { key: 'exposeMcp', label: 'Expose Histoire MCP tools to agents', icon: 'plug' },
  { key: 'attachScreenshot', label: 'Attach screenshot to comments', icon: 'camera' },
  { key: 'includeSource', label: 'Include story source and props', icon: 'code' },
] as const

/** Adds one disabled manual command; launch still requires explicit opt-in. */
function addAgent(): void {
  if (!state.value) return
  const id = `agent-${Date.now().toString(36)}`
  agents?.configure({ presets: [...state.value.presets, { id, name: 'New agent', command: 'agent-acp' }] })
}
/** A verified receipt updates display baseline after server retires matching overrides. */
function saved(path: 'presets' | 'permissions'): void {
  if (!state.value) return
  if (path === 'presets') projectPresets.value = structuredClone(state.value.presets)
  else projectPermissions.value = structuredClone(state.value.permissions)
}
</script>

<template>
  <section v-if="agents && state">
    <h1>AI agents</h1>
    <div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <strong>Enable local agents</strong><HstSwitch layout="inline" aria-label="Enable local agents" :model-value="state.enabled" :disabled="agents.pending.value || !agents.connected.value" @update:model-value="agents.configure({ enabled: $event })" />
      </div>
    </div>
    <div class="histoire-settings-card">
      <header>
        <strong>Agents</strong><HstButton color="default" type="button" class="histoire-settings-action" :disabled="agents.pending.value || !agents.connected.value || state.presets.length >= 32" @click="addAgent">
          <WorkbenchIcon name="add" :size="14" />Add agent
        </HstButton>
      </header>
      <AgentPresetRow v-for="preset in state.presets" :key="preset.id" :agent-id="preset.id" />
      <p v-if="!state.presets.length" class="histoire-agent-empty">
        {{ agents.connected.value ? 'No agents configured' : 'Connecting to dev server' }}
      </p>
      <SaveToProject path="agents.presets" :value="state.presets" :project-value="projectPresets" :local="JSON.stringify(state.presets) !== JSON.stringify(projectPresets)" @reset="agents.resetProject(['agents.presets'])" @saved="saved('presets')" />
    </div>
    <div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <WorkbenchIcon name="edit" :size="18" /><strong>File edits</strong><HstButtonGroup layout="inline" aria-label="File edit policy" :model-value="state.permissions.fileEdits ?? 'ask'" :options="filePolicies" :disabled="agents.pending.value" @update:model-value="agents.configure({ permissions: { ...state.permissions, fileEdits: $event } })" />
      </div>
      <div class="histoire-settings-row">
        <WorkbenchIcon name="terminal" :size="18" /><strong>Terminal commands</strong><HstButtonGroup layout="inline" aria-label="Terminal policy" :model-value="state.permissions.terminal ?? 'ask'" :options="terminalPolicies" :disabled="agents.pending.value" @update:model-value="agents.configure({ permissions: { ...state.permissions, terminal: $event } })" />
      </div>
      <div class="histoire-settings-row">
        <WorkbenchIcon name="chat" :size="18" /><strong>Canvas comments go to</strong><HstButtonGroup layout="inline" aria-label="Comment destination" :model-value="state.context.askEachTime" :options="[{ value: false, label: 'Default agent' }, { value: true, label: 'Ask each time' }]" :disabled="agents.pending.value" @update:model-value="agents.configure({ context: { ...state.context, askEachTime: $event } })" />
      </div>
      <SaveToProject path="agents.permissions" :value="state.permissions" :project-value="projectPermissions" :local="JSON.stringify(state.permissions) !== JSON.stringify(projectPermissions)" @reset="agents.resetProject(['agents.permissions'])" @saved="saved('permissions')" />
    </div>
    <div class="histoire-settings-card">
      <div v-for="option in contextOptions" :key="option.key" class="histoire-settings-row">
        <WorkbenchIcon :name="option.icon" :size="18" /><strong>{{ option.label }}</strong><HstSwitch layout="inline" :aria-label="option.label" :model-value="state.context[option.key]" :disabled="agents.pending.value" @update:model-value="agents.configure({ context: { ...state.context, [option.key]: $event } })" />
      </div>
    </div>
    <p v-if="agents.error.value" role="alert" class="histoire-agent-error">
      {{ agents.error.value }}
    </p>
  </section>
  <section v-else>
    <h1>AI agents</h1><p>Agent settings unavailable</p>
  </section>
</template>
