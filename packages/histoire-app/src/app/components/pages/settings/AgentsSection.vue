<script setup lang="ts">
import type { UiAgentSettings } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstButtonGroup, HstPulsatingDisc, HstSwitch, HstText } from '@histoire/controls/vue'
import { ACP_PRESETS } from '@histoire/shared'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'
import { agentCatalogRows } from '../../../util/agent-catalog-rows.js'
import { histoireConfig } from '../../../util/config.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'

import AgentPresetRow from './AgentPresetRow.vue'
import SaveToProject from './SaveToProject.vue'
import './agents-settings.css'

/** Provider owns safe development-only user preferences. */
const agents = useAgentsStore()
/** Snapshot remains authoritative until server confirms each command. */
const state = computed(() => agents?.state.value)
/** Registry search does not change configured preset ownership. */
const query = ref('')
/** Scoped DOM owner prevents a late confirmation from scrolling another settings visit. */
const section = ref<HTMLElement>()
/** Only an explicit Add agent command grants one reveal after server confirmation. */
const pendingRevealId = ref<string>()
/** Entire catalog merges with local overrides independently of 32-preset cap. */
const rows = computed(() => state.value ? agentCatalogRows(state.value, agents?.catalog.value.entries ?? [], query.value) : [])
watch([() => state.value?.presets, () => agents?.pending.value, () => agents?.connected.value, pendingRevealId], revealAddedAgent)
onMounted(() => {
  void agents?.loadRegistry()
})
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
  if (!agents || !state.value || agents.pending.value || !agents.connected.value) return
  const id = `agent-${Date.now().toString(36)}`
  pendingRevealId.value = id
  agents.configure({ presets: [...state.value.presets, { id, name: 'New agent', command: 'agent-acp' }] })
}
/** Expands and centers the confirmed identity after clearing any filter that would hide its row. */
async function revealAddedAgent(): Promise<void> {
  const id = pendingRevealId.value
  if (!id) return
  if (!agents?.connected.value) {
    pendingRevealId.value = undefined
    return
  }
  if (!state.value?.presets.some(preset => preset.id === id)) {
    if (!agents.pending.value) pendingRevealId.value = undefined
    return
  }
  // Clearing search schedules another DOM update; wait before locating the sorted row.
  query.value = ''
  await nextTick()
  if (!section.value || pendingRevealId.value !== id) return
  pendingRevealId.value = undefined
  const row = section.value.querySelector<HTMLElement>(`[data-agent-id="${id}"]`)
  const details = row?.querySelector<HTMLDetailsElement>('details')
  // Expand the native disclosure first so scrolling uses the full settings height.
  if (details) details.open = true
  row?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' })
}
/** A verified receipt updates display baseline after server retires matching overrides. */
function saved(path: 'presets' | 'permissions'): void {
  if (!state.value) return
  if (path === 'presets') projectPresets.value = structuredClone(state.value.presets)
  else projectPermissions.value = structuredClone(state.value.permissions)
}
</script>

<template>
  <section v-if="agents && state" ref="section">
    <h1>AI agents</h1>
    <div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <strong>Enable local agents</strong><HstSwitch layout="inline" aria-label="Enable local agents" :model-value="state.enabled" :disabled="agents.pending.value || !agents.connected.value" @update:model-value="agents.configure({ enabled: $event })" />
      </div>
    </div>
    <div class="histoire-settings-card">
      <header>
        <strong>Agents</strong><HstButton color="default" type="button" class="histoire-settings-action" :disabled="agents.pending.value || !agents.connected.value || state.presets.length >= 32" @click="addAgent">
          <BuiltinIcon icon="add" :size="14" />Add agent
        </HstButton>
      </header>
      <div class="histoire-agent-catalog-tools">
        <HstText v-model="query" layout="inline" aria-label="Search agents" placeholder="Search agents" />
        <HstButton type="button" color="default" class="histoire-settings-action" aria-label="Refresh agent registry" :disabled="agents.catalogLoading.value || !agents.connected.value" @click="agents.loadRegistry(true)">
          <HstPulsatingDisc v-if="agents.catalogLoading.value" :size="14" /><BuiltinIcon v-else icon="renew" :size="14" />Refresh
        </HstButton>
      </div>
      <p v-if="agents.catalogLoaded.value && agents.catalog.value.status.state !== 'fresh'" class="histoire-agent-warning" role="status">
        {{ agents.catalog.value.status.state === 'stale' ? 'Using cached agent registry' : 'Agent registry unavailable' }}
      </p>
      <AgentPresetRow v-for="row in rows" :key="row.id" :agent-id="row.id" :registry-entry="row.registryEntry" />
      <WorkbenchLoadingState v-if="!rows.length && !agents.connected.value" title="Connecting to dev server" />
      <WorkbenchLoadingState v-else-if="!rows.length && agents.catalogLoading.value" title="Loading agents" />
      <WorkbenchEmptyState v-else-if="!rows.length" icon="search" :title="query.trim() ? 'No matches' : 'No agents configured'" />
      <SaveToProject path="agents.presets" :value="state.presets" :project-value="projectPresets" :local="JSON.stringify(state.presets) !== JSON.stringify(projectPresets)" @reset="agents.resetProject(['agents.presets'])" @saved="saved('presets')" />
    </div>
    <div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <BuiltinIcon icon="edit" :size="18" /><strong>File edits</strong><HstButtonGroup layout="inline" aria-label="File edit policy" :model-value="state.permissions.fileEdits ?? 'ask'" :options="filePolicies" :disabled="agents.pending.value" @update:model-value="agents.configure({ permissions: { ...state.permissions, fileEdits: $event } })" />
      </div>
      <div class="histoire-settings-row">
        <BuiltinIcon icon="terminal" :size="18" /><strong>Terminal commands</strong><HstButtonGroup layout="inline" aria-label="Terminal policy" :model-value="state.permissions.terminal ?? 'ask'" :options="terminalPolicies" :disabled="agents.pending.value" @update:model-value="agents.configure({ permissions: { ...state.permissions, terminal: $event } })" />
      </div>
      <div class="histoire-settings-row">
        <BuiltinIcon icon="chat" :size="18" /><strong>Canvas comments go to</strong><HstButtonGroup layout="inline" aria-label="Comment destination" :model-value="state.context.askEachTime" :options="[{ value: false, label: 'Default agent' }, { value: true, label: 'Ask each time' }]" :disabled="agents.pending.value" @update:model-value="agents.configure({ context: { ...state.context, askEachTime: $event } })" />
      </div>
      <SaveToProject path="agents.permissions" :value="state.permissions" :project-value="projectPermissions" :local="JSON.stringify(state.permissions) !== JSON.stringify(projectPermissions)" @reset="agents.resetProject(['agents.permissions'])" @saved="saved('permissions')" />
    </div>
    <div class="histoire-settings-card">
      <div v-for="option in contextOptions" :key="option.key" class="histoire-settings-row">
        <BuiltinIcon :icon="option.icon" :size="18" /><strong>{{ option.label }}</strong><HstSwitch layout="inline" :aria-label="option.label" :model-value="state.context[option.key]" :disabled="agents.pending.value" @update:model-value="agents.configure({ context: { ...state.context, [option.key]: $event } })" />
      </div>
    </div>
    <p v-if="agents.error.value" role="alert" class="histoire-agent-error">
      {{ agents.error.value }}
    </p>
  </section>
  <section v-else>
    <h1>AI agents</h1><WorkbenchEmptyState icon="bot" title="Agent settings unavailable" />
  </section>
</template>
