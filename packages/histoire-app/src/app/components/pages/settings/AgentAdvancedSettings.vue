<script setup lang="ts">
import type { UiAgentRegistryEntry } from '@histoire/shared'
import { HstButton, HstText } from '@histoire/controls/vue'
import { ACP_INSTALL_HINTS } from '@histoire/shared'
import { computed, ref, watch } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'
import AgentArgumentsField from './AgentArgumentsField.vue'
import AgentEnvironmentField from './AgentEnvironmentField.vue'

/** Editable launch fields shared by baseline and draft. */
interface LaunchDraft { name: string, command: string, args: string[], cwd: string }

/** Stable public preset identity; credentials use a separate write-only action. */
const props = defineProps<{ agentId: string, registryEntry?: UiAgentRegistryEntry }>()
/** Row keeps validation failures visible while disclosure is collapsed. */
const emit = defineEmits<{ error: [message: string] }>()
/** Settings authority inherited from the standalone dev provider. */
const agents = useAgentsStore()!
/** Current server-owned launch definition. */
const preset = computed(() => agents.state.value.presets.find(item => item.id === props.agentId)!)
/** Safe logs and process lifecycle. */
const status = computed(() => agents.state.value.agents.find(item => item.id === props.agentId))
/** Registry-linked presets display the catalog launch command until explicitly edited. */
const linked = computed(() => Boolean(preset.value?.registryId && props.registryEntry?.available))
/** Saved values the draft is compared against; undefined while the row is being removed. */
const baseline = computed<LaunchDraft | undefined>(() => preset.value && {
  name: preset.value.name,
  command: linked.value ? props.registryEntry!.command : preset.value.command,
  args: [...(linked.value ? props.registryEntry!.args ?? [] : preset.value.args ?? [])],
  cwd: preset.value.cwd ?? '',
})
/** Unsaved edits, kept across disclosure toggles and unrelated preset changes (e.g. model). */
const draft = ref<LaunchDraft>({ name: '', command: '', args: [], cwd: '' })
/** Local disclosure state for redacted stderr. */
const logs = ref(false)
/** Local command/environment validation message. */
const error = ref('')
watch(error, message => emit('error', message))
watch(() => JSON.stringify(baseline.value), discard, { immediate: true })

/** Trims text fields and drops blank argument rows before comparing or saving. */
const normalized = computed<LaunchDraft>(() => ({
  name: draft.value.name.trim(),
  command: draft.value.command.trim(),
  args: draft.value.args.filter(arg => arg !== ''),
  cwd: draft.value.cwd.trim(),
}))
/** Enables save/discard only when something differs from saved settings. */
const dirty = computed(() => JSON.stringify(normalized.value) !== JSON.stringify(baseline.value))

/** Restores the draft from saved settings. */
function discard(): void {
  if (!baseline.value) return
  draft.value = structuredClone(baseline.value)
  error.value = ''
}

/** Persists one edited command without changing other presets or private env. */
function save(): void {
  const next = normalized.value
  if (!next.command) {
    error.value = 'Enter a command'
    return
  }
  if (!next.name) {
    error.value = 'Enter a name'
    return
  }
  // Editing the launch command of a registry agent detaches it from catalog updates.
  const changedLaunch = next.command !== baseline.value?.command || JSON.stringify(next.args) !== JSON.stringify(baseline.value?.args)
  agents.configure({ presets: agents.state.value.presets.map((item) => {
    if (item.id !== props.agentId) return item
    const updated = { ...item, name: next.name, cwd: next.cwd }
    if (!next.cwd) delete updated.cwd
    if (changedLaunch || !item.registryId) {
      delete updated.registryId
      updated.command = next.command
      updated.args = next.args
    }
    return updated
  }) })
  error.value = ''
}

/** One explicit default chooses the destination for later comment sends. */
function setDefault(): void {
  agents.configure({ presets: agents.state.value.presets.map(item => ({ ...item, default: item.id === props.agentId })) })
}

/** Removing a preset stops its owned process through manager configuration. */
function remove(): void {
  agents.configure({ presets: agents.state.value.presets.filter(item => item.id !== props.agentId), enabledIds: agents.state.value.enabledIds.filter(id => id !== props.agentId) })
}
</script>

<template>
  <form class="histoire-agent-form" @submit.prevent="save">
    <label><span>Name</span><HstText v-model="draft.name" layout="inline" class="histoire-settings-field" :aria-label="`${preset.name} name`" /></label>
    <label><span>Command</span><HstText v-model="draft.command" layout="inline" class="histoire-settings-field histoire-agent-command" :aria-label="`${preset.name} command`" placeholder="Executable name or path" spellcheck="false" /></label>
    <div class="histoire-agent-form-row">
      <span>Arguments</span><AgentArgumentsField v-model="draft.args" :label="preset.name" />
    </div>
    <label><span>Working directory</span><HstText v-model="draft.cwd" layout="inline" class="histoire-settings-field histoire-agent-command" :aria-label="`${preset.name} working directory`" placeholder="Project root" spellcheck="false" /></label>
    <div class="histoire-agent-form-row">
      <span>Environment</span><AgentEnvironmentField :agent-id="agentId" :label="preset.name" @error="error = $event" />
    </div>
    <code v-if="status?.state === 'not-installed' && ACP_INSTALL_HINTS[agentId]" class="histoire-agent-install">{{ ACP_INSTALL_HINTS[agentId] }}</code>
    <div class="histoire-agent-form-actions">
      <HstButton color="primary" type="submit" class="histoire-settings-action" :disabled="!dirty || agents.pending.value">
        Save
      </HstButton><HstButton v-if="dirty" color="default" type="button" class="histoire-settings-action" @click="discard">
        Discard
      </HstButton>
      <span class="histoire-agent-form-actions-end">
        <HstButton v-if="status?.enabled" color="default" type="button" class="histoire-settings-action" :disabled="agents.pending.value" @click="agents.restart(agentId)">
          Restart
        </HstButton><HstButton color="default" type="button" class="histoire-settings-action" :aria-expanded="logs" @click="logs = !logs">
          {{ logs ? 'Hide logs' : 'Logs' }}
        </HstButton><HstButton v-if="!preset.default" color="default" type="button" class="histoire-settings-action" :disabled="agents.pending.value" @click="setDefault">
          Make default
        </HstButton><HstButton color="default" type="button" class="histoire-settings-action histoire-agent-remove" :disabled="agents.pending.value" @click="remove">
          Remove
        </HstButton>
      </span>
    </div>
    <pre v-if="logs" class="histoire-agent-logs">{{ status?.logs.length ? status.logs.join('\n') : 'No logs' }}</pre>
  </form>
</template>
