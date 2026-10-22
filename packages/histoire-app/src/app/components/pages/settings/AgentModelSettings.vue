<script setup lang="ts">
import type { UiAgentConfigSelector } from '@histoire/shared'
import { HstButton, HstPulsatingDisc, HstSelect } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useAgentDiscovery } from '../../../composables/agent-discovery.js'
import { useAgentsStore } from '../../../stores/agents.js'

/** Model defaults belong to configured preset, not a temporary discovery session. */
const props = defineProps<{ agentId: string }>()
/** Exact workbench authority. */
const agents = useAgentsStore()!
/** Server-confirmed defaults. */
const preset = computed(() => agents.state.value.presets.find(item => item.id === props.agentId)!)
const { allowed, discovery } = useAgentDiscovery(agents, () => props.agentId)

/** Preserve unavailable saved selection visibly instead of displaying misleading default. */
function choices(selector: UiAgentConfigSelector | undefined, current?: string) {
  const options = [{ value: '', label: 'Agent default', disabled: false }, ...(selector?.options ?? []).map(option => ({ value: option.value, label: option.group ? `${option.group} / ${option.label}` : option.label, disabled: false }))]
  if (current && !options.some(option => option.value === current)) options.push({ value: current, label: `${current} (unavailable)`, disabled: true })
  return options
}

/** Model change clears old effort before discovering dependent choices. */
function select(field: 'model' | 'effort', value: string): void {
  agents.configure({ presets: agents.state.value.presets.map((item) => {
    if (item.id !== props.agentId) return item
    const next = { ...item }
    delete next[field]
    if (value) next[field] = value
    if (field === 'model') delete next.effort
    return next
  }) })
}
</script>

<template>
  <div class="histoire-agent-models">
    <label><span>Model</span><HstSelect layout="inline" :aria-label="`${preset.name} model`" :model-value="preset.model ?? ''" :options="choices(discovery?.value?.model, preset.model)" :disabled="!allowed || agents.pending.value || discovery?.loading || !discovery?.value?.model" @update:model-value="select('model', $event)" /></label>
    <label><span>Effort</span><HstSelect layout="inline" :aria-label="`${preset.name} effort`" :model-value="preset.effort ?? ''" :options="choices(discovery?.value?.effort, preset.effort)" :disabled="!allowed || agents.pending.value || discovery?.loading || !discovery?.value?.effort" @update:model-value="select('effort', $event)" /></label>
    <span v-if="discovery?.loading" class="histoire-agent-model-loading" role="status"><HstPulsatingDisc :size="12" />Loading models</span>
    <div v-if="discovery?.error" class="histoire-agent-model-error">
      <span role="alert">{{ discovery.error }}</span><HstButton type="button" color="default" class="histoire-settings-action" @click="agents.discoverAgent(agentId, true)">
        Retry
      </HstButton>
    </div>
    <p v-if="discovery?.value?.warning" role="status" class="histoire-agent-warning">
      {{ discovery.value.warning }}
    </p>
  </div>
</template>
