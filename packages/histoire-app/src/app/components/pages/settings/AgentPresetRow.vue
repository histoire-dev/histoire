<script setup lang="ts">
import { HstButton, HstSwitch, HstText } from '@histoire/controls/vue'
import { ACP_INSTALL_HINTS } from '@histoire/shared'
import { computed, ref, watch } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

/** Stable public preset identity; credentials use a separate write-only action. */
const props = defineProps<{ agentId: string }>()
/** Settings authority inherited from the standalone dev provider. */
const agents = useAgentsStore()!
/** Current server-owned launch definition. */
const preset = computed(() => agents.state.value.presets.find(item => item.id === props.agentId)!)
/** Safe logs and process lifecycle. */
const status = computed(() => agents.state.value.agents.find(item => item.id === props.agentId))
/** Unsaved display-name draft. */
const name = ref('')
/** Unsaved executable draft. */
const command = ref('')
/** Arguments draft uses JSON to preserve exact argument boundaries. */
const args = ref('[]')
/** Unsaved project-relative working directory. */
const cwd = ref('.')
/** Newly entered variable name, never persisted in browser storage. */
const envKey = ref('')
/** Newly entered credential, cleared after its write-only POST succeeds. */
const envValue = ref('')
/** Local disclosure state for redacted stderr. */
const logs = ref(false)
/** Local command/environment validation message. */
const error = ref('')
/** Prevents duplicate credential POSTs. */
const savingEnvironment = ref(false)
/** Readable process states shared by command rows. */
const labels = { 'disabled': 'Disabled', 'starting': 'Starting', 'connected': 'Connected', 'idle': 'Idle', 'error': 'Error', 'not-installed': 'Not installed' }
watch(() => JSON.stringify(preset.value), () => {
  if (!preset.value) return
  name.value = preset.value.name
  command.value = preset.value.command
  args.value = JSON.stringify(preset.value.args ?? [])
  cwd.value = preset.value.cwd ?? '.'
}, { immediate: true })

/** Persists one edited command without changing other presets or private env. */
function save(): void {
  try {
    const parsed = JSON.parse(args.value)
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string') || !name.value.trim() || !command.value.trim()) throw new Error('invalid')
    agents.configure({ presets: agents.state.value.presets.map(item => item.id === props.agentId ? { ...item, name: name.value.trim(), command: command.value.trim(), args: parsed, cwd: cwd.value } : item) })
    error.value = ''
  }
  catch { error.value = 'Enter command and a JSON array of arguments' }
}

/** Saves only new user credentials, clearing their browser field on success. */
async function saveEnvironment(): Promise<void> {
  if (!/^[a-z_]\w*$/i.test(envKey.value)) {
    error.value = 'Enter a valid environment variable name'
    return
  }
  savingEnvironment.value = true
  try {
    if (await agents.environment(props.agentId, { [envKey.value]: envValue.value })) {
      envKey.value = ''
      envValue.value = ''
      error.value = ''
    }
  }
  finally { savingEnvironment.value = false }
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
  <details v-if="preset" class="histoire-agent-row" :open="preset.default">
    <summary>
      <span class="histoire-agent-icon"><WorkbenchIcon name="bot" :size="20" /></span>
      <span class="histoire-agent-identity"><strong>{{ preset.name }}</strong><span v-if="preset.default" class="histoire-agent-default">Default</span><code>{{ [preset.command, ...(preset.args ?? [])].join(' ') }}</code></span>
      <span class="histoire-agent-status" :data-state="status?.state ?? 'disabled'">{{ labels[status?.state ?? 'disabled'] }}</span>
      <WorkbenchIcon name="chevron-down" :size="16" />
    </summary>
    <form class="histoire-agent-form" @submit.prevent="save">
      <label><span>Name</span><HstText v-model="name" layout="inline" class="histoire-settings-field" :aria-label="`${preset.name} name`" /></label>
      <label><span>Command</span><HstText v-model="command" layout="inline" class="histoire-settings-field histoire-agent-command" :aria-label="`${preset.name} command`" spellcheck="false" /></label>
      <label><span>Arguments</span><HstText v-model="args" layout="inline" class="histoire-settings-field histoire-agent-command" :aria-label="`${preset.name} arguments`" spellcheck="false" /></label>
      <label><span>Working directory</span><HstText v-model="cwd" layout="inline" class="histoire-settings-field histoire-agent-command" :aria-label="`${preset.name} working directory`" spellcheck="false" /></label>
      <div class="histoire-agent-form-row">
        <span>Environment</span><div class="histoire-agent-env">
          <HstText v-model="envKey" layout="inline" class="histoire-settings-field histoire-agent-command" placeholder="Variable name" :aria-label="`${preset.name} environment variable name`" autocomplete="off" /><HstText v-model="envValue" layout="inline" class="histoire-settings-field" type="password" placeholder="Value" :aria-label="`${preset.name} environment value`" autocomplete="new-password" /><HstButton color="default" type="button" class="histoire-settings-action" :disabled="savingEnvironment || !envKey" @click="saveEnvironment">
            Save
          </HstButton>
        </div>
      </div>
      <div v-if="status?.envKeys.length" class="histoire-agent-form-row">
        <span /><span class="histoire-settings-muted">Saved: {{ status.envKeys.join(', ') }}</span>
      </div>
      <div class="histoire-agent-form-row">
        <span>Enabled</span><HstSwitch layout="inline" :model-value="agents.state.value.enabledIds.includes(agentId)" :aria-label="`Enable ${preset.name}`" :disabled="agents.pending.value" @update:model-value="agents.enableAgent(agentId, $event)" />
      </div>
      <div class="histoire-agent-form-actions">
        <HstButton color="default" type="submit" class="histoire-settings-action" :disabled="agents.pending.value">
          Save command
        </HstButton><HstButton color="default" type="button" class="histoire-settings-action" :disabled="!status?.enabled || agents.pending.value" @click="agents.restart(agentId)">
          Restart
        </HstButton><HstButton color="default" type="button" class="histoire-settings-action" @click="logs = !logs">
          {{ logs ? 'Hide logs' : 'View logs' }}
        </HstButton><HstButton v-if="!preset.default" color="default" type="button" class="histoire-settings-action" :disabled="agents.pending.value" @click="setDefault">
          Set default
        </HstButton><HstButton color="default" type="button" class="histoire-settings-action" :disabled="agents.pending.value" @click="remove">
          Remove
        </HstButton>
      </div>
      <p v-if="error || status?.error" role="alert" class="histoire-agent-error">
        {{ error || status?.error }}
      </p>
      <code v-if="status?.state === 'not-installed' && ACP_INSTALL_HINTS[agentId]" class="histoire-agent-install">{{ ACP_INSTALL_HINTS[agentId] }}</code>
      <pre v-if="logs" class="histoire-agent-logs">{{ status?.logs.length ? status.logs.join('\n') : 'No logs' }}</pre>
    </form>
  </details>
</template>
