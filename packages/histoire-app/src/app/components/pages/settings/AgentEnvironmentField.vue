<script setup lang="ts">
import { HstButton, HstText } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { useAgentsStore } from '../../../stores/agents.js'

/** Agent receiving write-only credentials; `label` prefixes accessible field names. */
const props = defineProps<{ agentId: string, label: string }>()
/** Validation failures surface through the row-level alert. */
const emit = defineEmits<{ error: [message: string] }>()
/** Settings authority inherited from the standalone dev provider. */
const agents = useAgentsStore()!
/** Names of variables already stored server-side; values are never readable. */
const savedKeys = computed(() => agents.state.value.agents.find(item => item.id === props.agentId)?.envKeys ?? [])
/** Newly entered variable name, never persisted in browser storage. */
const key = ref('')
/** Newly entered credential, cleared after its write-only POST succeeds. */
const value = ref('')
/** Prevents duplicate credential POSTs. */
const saving = ref(false)
/** Value input focused after picking a saved variable to replace. */
const valueField = ref<{ focus: () => void }>()

/** Saves one variable, clearing both fields on success. */
async function save(): Promise<void> {
  if (!/^[a-z_]\w*$/i.test(key.value)) {
    emit('error', 'Enter a valid environment variable name')
    return
  }
  saving.value = true
  try {
    if (await agents.environment(props.agentId, { [key.value]: value.value })) {
      key.value = ''
      value.value = ''
      emit('error', '')
    }
  }
  finally { saving.value = false }
}

/**
 * Prefills a saved variable name so its hidden value can be replaced.
 * @param name Saved variable name.
 */
function replace(name: string): void {
  key.value = name
  value.value = ''
  valueField.value?.focus()
}
</script>

<template>
  <div class="histoire-agent-env">
    <div v-if="savedKeys.length" class="histoire-agent-env-saved">
      <HstButton v-for="name in savedKeys" :key="name" color="default" type="button" class="histoire-settings-action histoire-agent-env-key" :title="`Replace ${name}`" @click="replace(name)">
        {{ name }}<span aria-hidden="true">••••</span>
      </HstButton>
    </div>
    <!-- Enter saves this variable instead of submitting the surrounding launch settings form. -->
    <div class="histoire-agent-env-fields" @keydown.enter.prevent="save">
      <HstText v-model="key" layout="inline" class="histoire-settings-field histoire-agent-command" placeholder="NAME" :aria-label="`${label} environment variable name`" spellcheck="false" autocomplete="off" />
      <HstText ref="valueField" v-model="value" layout="inline" class="histoire-settings-field" type="password" placeholder="Value" :aria-label="`${label} environment value`" autocomplete="new-password" />
      <HstButton color="default" type="button" class="histoire-settings-action" :disabled="saving || !key" @click="save">
        {{ savedKeys.includes(key) ? 'Replace' : 'Add' }}
      </HstButton>
    </div>
  </div>
</template>
