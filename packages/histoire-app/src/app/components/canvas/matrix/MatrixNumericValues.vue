<script setup lang="ts">
import { HstButton, HstButtonGroup, HstText } from '@histoire/controls/vue'
import { getHistoireMatrixRange, getHistoireMatrixRangeValues, getHistoireNumericMatrixValues } from '@histoire/protocol'
import { computed, ref, watch } from 'vue'
import { useMatrixStore } from '../../../stores/matrix.js'
import { parseMatrixNumber, parseMatrixNumericValues } from '../../../util/matrix-numeric.js'
import './matrix-axis-form.css'

const props = defineProps<{
  /** Selected numeric prop; its store owns defaults and persisted overrides. */
  name: string
}>()
const emit = defineEmits<{ close: [] }>()
const matrix = useMatrixStore()
const axis = computed(() => matrix.axes.value.find(axis => axis.name === props.name))
const mode = ref<'values' | 'range'>('values')
const values = ref('')
const min = ref('')
const max = ref('')
const step = ref('')
const error = ref('')

watch([() => matrix.storyId.value, () => props.name, () => JSON.stringify(axis.value?.values)], (current, previous) => {
  // Base-prop edits must not replace an unfinished numeric draft. Only its
  // owner or effective domain changes synchronize editor inputs.
  if (current[0] !== previous?.[0] || current[1] !== previous?.[1]) mode.value = 'values'
  synchronizeDraft()
}, { immediate: true })

/** Populate both editor modes from current domain, clearing unfinished input. */
function synchronizeDraft(): void {
  const domain = axis.value?.values ?? []
  values.value = domain.join(', ')
  const numeric = getHistoireNumericMatrixValues(domain)
  const range = numeric && getHistoireMatrixRange(numeric)
  min.value = range ? String(range.min) : ''
  max.value = range ? String(range.max) : ''
  step.value = range ? String(range.step) : ''
  error.value = ''
}

/** Reset discards local values and closes the editor. */
function reset(): void {
  try {
    matrix.resetNumericValues(props.name)
    emit('close')
  }
  catch (cause) { error.value = (cause as Error).message }
}

/** Publish validated list/range only when the whole draft is usable. */
function apply(): void {
  try {
    let domain: number[]
    if (mode.value === 'values') {
      domain = parseMatrixNumericValues(values.value)
    }
    else {
      const range = getHistoireMatrixRangeValues({ min: parseMatrixNumber(min.value), max: parseMatrixNumber(max.value), step: parseMatrixNumber(step.value) })
      const numeric = getHistoireNumericMatrixValues(range)
      if (!numeric) throw new Error('Enter an increasing range with a positive step and 2–64 values')
      domain = numeric
    }
    matrix.setNumericValues(props.name, domain)
    error.value = ''
    emit('close')
  }
  catch (cause) { error.value = (cause as Error).message }
}
</script>

<template>
  <div class="histoire-matrix-axis-form" role="group" :aria-label="`${name} numeric values`" @keydown.esc.stop="emit('close')">
    <HstButtonGroup v-model="mode" layout="inline" :aria-label="`${name} value input`" :options="[{ value: 'values', label: 'Values' }, { value: 'range', label: 'Range' }]" />
    <HstText v-if="mode === 'values'" v-model="values" title="Values" :aria-label="`${name} values`" spellcheck="false" @keydown.enter.prevent="apply" />
    <div v-else class="histoire-matrix-range">
      <HstText v-model="min" title="Min" :aria-label="`${name} min`" @keydown.enter.prevent="apply" />
      <HstText v-model="max" title="Max" :aria-label="`${name} max`" @keydown.enter.prevent="apply" />
      <HstText v-model="step" title="Step" :aria-label="`${name} step`" @keydown.enter.prevent="apply" />
    </div>
    <span v-if="error" role="alert">{{ error }}</span>
    <div class="histoire-matrix-axis-form-actions">
      <HstButton class="histoire-matrix-axis-form-secondary" color="flat" type="button" @click="reset">
        Reset values
      </HstButton>
      <HstButton color="flat" type="button" @click="emit('close')">
        Cancel
      </HstButton>
      <HstButton color="primary" type="button" @click="apply">
        Apply
      </HstButton>
    </div>
  </div>
</template>

<style scoped>
.histoire-matrix-range { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
</style>
