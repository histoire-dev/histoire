<script setup lang="ts">
import type { UiAgentRegistryEntry } from '@histoire/shared'
import { BuiltinIcon, HstPulsatingDisc, HstSwitch } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'
import { formatAgentCommand } from '../../../util/agent-command.js'
import { agentIconUrl } from '../../../util/agents-http.js'
import AgentLogo from '../../agents/AgentLogo.vue'
import AgentAdvancedSettings from './AgentAdvancedSettings.vue'
import AgentModelSettings from './AgentModelSettings.vue'

/** Configured ID retains credentials; unconfigured catalog entry uses canonical ID. */
const props = defineProps<{ agentId: string, registryEntry?: UiAgentRegistryEntry }>()
/** Provider owns preferences and separate HTTP catalog state. */
const agents = useAgentsStore()!
/** Optional local launch definition. */
const preset = computed(() => agents.state.value.presets.find(item => item.id === props.agentId))
/** Status only exists for configured presets. */
const status = computed(() => agents.state.value.agents.find(item => item.id === props.agentId))
/** Registry identity supplies display name before explicit configuration. */
const name = computed(() => preset.value?.name ?? props.registryEntry?.name ?? props.agentId)
/** Per-agent opt-in stays visible even when global switch is disabled. */
const enabled = computed(() => agents.state.value.enabledIds.includes(props.agentId))
/** Custom commands remain usable even when matching catalog entry lacks platform support. */
const unavailable = computed(() => (!preset.value || preset.value.registryId) && props.registryEntry?.available === false)
/** Custom commands are identified by their launch line since they have no registry logo. */
const commandLine = computed(() => preset.value && !preset.value.registryId ? formatAgentCommand(preset.value.command, preset.value.args) : undefined)
/** Off switch already conveys the idle disabled state; only show meaningful process states. */
const showStatus = computed(() => unavailable.value || (status.value && status.value.state !== 'disabled'))
/** Advanced form errors remain readable after disclosure closes. */
const advancedError = ref('')
/** Human-readable process states. */
const labels = { 'disabled': 'Disabled', 'starting': 'Starting', 'connected': 'Connected', 'idle': 'Idle', 'error': 'Error', 'not-installed': 'Not installed' }

/** Registry enablement adds only selected preset, never whole remote catalog. */
function toggle(value: boolean): void {
  if (preset.value) {
    agents.enableAgent(props.agentId, value)
  }
  else if (value && props.registryEntry?.available) {
    const entry = props.registryEntry
    agents.configure({ presets: [...agents.state.value.presets, { id: entry.id, registryId: entry.id, name: entry.name, command: entry.command, args: entry.args }], enabledIds: [...agents.state.value.enabledIds, entry.id] })
  }
}
</script>

<template>
  <article class="histoire-agent-row" :aria-label="name" :data-agent-id="agentId">
    <div class="histoire-agent-heading">
      <span class="histoire-agent-icon">
        <AgentLogo :icon="registryEntry?.icon ? agentIconUrl(registryEntry.id) : undefined" :size="20" />
      </span>
      <span class="histoire-agent-identity"><strong>{{ name }}</strong><span v-if="preset?.default" class="histoire-agent-default">Default</span><code v-if="commandLine" :title="commandLine">{{ commandLine }}</code></span>
      <span v-if="showStatus" class="histoire-agent-status" :data-state="status?.state ?? 'disabled'">
        <HstPulsatingDisc v-if="status?.state === 'starting'" :size="12" />
        {{ unavailable ? 'Unavailable on this platform' : labels[status?.state ?? 'disabled'] }}
      </span>
      <HstSwitch layout="inline" :model-value="enabled" :aria-label="`Enable ${name}`" :disabled="agents.pending.value || !agents.connected.value || unavailable || (!preset && agents.state.value.presets.length >= 32)" @update:model-value="toggle" />
    </div>
    <AgentModelSettings v-if="preset && enabled" :agent-id="agentId" />
    <p v-if="status?.error" role="alert" class="histoire-agent-error">
      {{ status.error }}
    </p>
    <p v-if="status?.warning" role="status" class="histoire-agent-warning">
      {{ status.warning }}
    </p>
    <p v-if="advancedError" role="alert" class="histoire-agent-error">
      {{ advancedError }}
    </p>
    <details v-if="preset" class="histoire-agent-advanced">
      <summary>{{ preset.registryId ? 'Advanced settings' : 'Configure' }}<BuiltinIcon icon="chevron-down" :size="16" /></summary>
      <AgentAdvancedSettings :agent-id="agentId" :registry-entry="registryEntry" @error="advancedError = $event" />
    </details>
  </article>
</template>
