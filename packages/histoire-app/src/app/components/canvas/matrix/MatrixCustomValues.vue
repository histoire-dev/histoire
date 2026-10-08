<script setup lang="ts">
import { HstButton, HstTextarea } from '@histoire/controls/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useMatrixStore } from '../../../stores/matrix.js'
import { formatMatrixCustomValues, parseMatrixCustomValues } from '../../../util/matrix-values.js'
import './matrix-axis-form.css'

const props = defineProps<{
  /** Exact local axis name; drafts belong to current story and domain. */
  name: string
}>()
const emit = defineEmits<{ close: [] }>()
const matrix = useMatrixStore()
const draft = ref('')
const error = ref('')
const field = ref<InstanceType<typeof HstTextarea>>()
const values = computed(() => matrix.customAxes.value[props.name] ?? matrix.axes.value.find(axis => axis.name === props.name)?.values)
watch([() => matrix.storyId.value, () => props.name, () => JSON.stringify(values.value)], synchronizeDraft, { immediate: true })
onMounted(() => field.value?.focus())

/** Restore saved values and clear errors without publishing draft edits. */
function synchronizeDraft(): void {
  draft.value = formatMatrixCustomValues(values.value ?? [])
  error.value = ''
}

/** Publish only a complete valid domain; malformed drafts remain local. */
function apply(): void {
  try {
    matrix.setCustomAxis(props.name, parseMatrixCustomValues(draft.value))
    error.value = ''
    emit('close')
  }
  catch (cause) { error.value = (cause as Error).message }
}
</script>

<template>
  <div class="histoire-matrix-axis-form" role="group" :aria-label="`${name} custom values`" @keydown.esc.stop="emit('close')" @keydown.enter.ctrl.exact.prevent="apply" @keydown.enter.meta.exact.prevent="apply">
    <HstTextarea ref="field" v-model="draft" title="Values" aria-label="Values" placeholder="One value per line" spellcheck="false" :rows="Math.min(Math.max(draft.split('\n').length, 3), 8)" />
    <span v-if="error" role="alert">{{ error }}</span>
    <div class="histoire-matrix-axis-form-actions">
      <HstButton color="flat" type="button" @click="emit('close')">
        Cancel
      </HstButton>
      <HstButton color="primary" type="button" @click="apply">
        Apply
      </HstButton>
    </div>
  </div>
</template>
