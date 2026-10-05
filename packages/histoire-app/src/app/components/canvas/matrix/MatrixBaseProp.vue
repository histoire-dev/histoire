<script setup lang="ts">
import type { MatrixProp, MatrixValue } from '../../../util/matrix.js'
import { HstNumber, HstSelect, HstSwitch, HstText, HstTextarea } from '@histoire/controls/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  /** Discovered editor label and runtime type. */
  prop: MatrixProp
  /** Shared current override value. */
  value: unknown
  /** Optional finite domain for non-axis enum editor. */
  values?: readonly MatrixValue[]
  /** Mark override differing from canonical/default value. */
  edited?: boolean
}>()
const emit = defineEmits<{ update: [value: unknown] }>()
const error = ref('')
const text = computed(() => {
  if (typeof props.value === 'string') return props.value
  try {
    return JSON.stringify(props.value, null, 2) ?? ''
  }
  catch { return '' }
})

/** Structured values accept JSON only; input never evaluates JavaScript. */
function structured(value: string): void {
  try {
    emit('update', JSON.parse(value))
    error.value = ''
  }
  catch { error.value = 'Enter valid JSON' }
}

/** Number edits reject unfinished/non-finite values without changing previews. */
function number(value: number): void {
  if (Number.isFinite(value)) emit('update', value)
}
</script>

<template>
  <div class="histoire-matrix-base-prop" :data-edited="edited">
    <span class="histoire-matrix-prop-label"><code>{{ prop.name }}<small v-if="edited"> · edited</small></code><span>{{ prop.type }}</span></span>
    <HstSelect v-if="values?.length" layout="inline" :aria-label="prop.name" :model-value="value" :options="values.map(option => ({ value: option, label: String(option) }))" @update:model-value="emit('update', $event)" />
    <HstSwitch v-else-if="prop.type === 'boolean' || typeof value === 'boolean'" layout="inline" :aria-label="prop.name" :model-value="Boolean(value)" @update:model-value="emit('update', $event)" />
    <HstNumber v-else-if="prop.type === 'number' || typeof value === 'number'" layout="inline" :aria-label="prop.name" :model-value="value as number" @update:model-value="number" />
    <HstText v-else-if="prop.type === 'string' || typeof value === 'string' || value === undefined" layout="inline" :aria-label="prop.name" type="text" :model-value="String(value ?? '')" @update:model-value="emit('update', $event)" />
    <HstTextarea v-else layout="inline" :aria-label="prop.name" :model-value="text" rows="3" @update:model-value="structured" />
    <span v-if="error" class="histoire-matrix-input-error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.histoire-matrix-base-prop { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.histoire-matrix-prop-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--histoire-muted); font-family: var(--histoire-font-mono); font-size: 13px; }
.histoire-matrix-prop-label code { color: var(--histoire-text); font-size: 13px; }
.histoire-matrix-prop-label small { color: var(--histoire-accent-link); font-size: 13px; }
.histoire-matrix-input-error { color: var(--histoire-danger); font-size: 13px; }
</style>
