<script setup lang="ts">
import type { UiAgentElicitationTextField, UiAgentElicitationValue } from '@histoire/shared'
import type { ElicitationChoiceField } from './elicitation-fields.js'
import { HstText } from '@histoire/controls/vue'
import { computed, nextTick, ref, useId } from 'vue'
import { fieldTitle, parseOptionLabel } from './elicitation-fields.js'

const props = defineProps<{
  /** Single or multiple choice field. */
  field: ElicitationChoiceField
  /** Selected value(s). */
  modelValue?: UiAgentElicitationValue
  /** Free-text field shown as a trailing "Other…" option. */
  custom?: UiAgentElicitationTextField
  /** Free-text answer. */
  customValue?: UiAgentElicitationValue
  /** Ids of the hint and error lines describing the group. */
  describedBy?: string
}>()
const emit = defineEmits<{
  /** New selection. */
  'update:modelValue': [value: UiAgentElicitationValue | undefined]
  /** New free-text answer. */
  'update:customValue': [value: string]
}>()
/** Shared radio group name. */
const name = `elicitation-${useId()}`
const multiple = computed(() => props.field.type === 'multi-choice')
/** Options with the recommendation marker split off their label. */
const options = computed(() => props.field.options.map(option => ({ ...option, ...parseOptionLabel(option.label) })))
const selected = computed(() => Array.isArray(props.modelValue) ? props.modelValue : [])
/** "Other…" is picked; starts picked when the agent seeded a free-text default. */
const other = ref(typeof props.customValue === 'string' && props.customValue !== '')
const otherInput = ref<InstanceType<typeof HstText>>()

/**
 * Whether an option is currently picked.
 * @param value Option value.
 */
function isChecked(value: string): boolean {
  return multiple.value ? selected.value.includes(value) : !other.value && props.modelValue === value
}

/**
 * Picks or toggles a fixed option. A single choice replaces "Other…" and drops its text.
 * @param value Option value.
 */
function pick(value: string): void {
  if (multiple.value) {
    emit('update:modelValue', selected.value.includes(value) ? selected.value.filter(item => item !== value) : [...selected.value, value])
    return
  }
  if (other.value) emit('update:customValue', '')
  other.value = false
  emit('update:modelValue', value)
}

/** Picks or toggles "Other…"; a single choice clears its value so only the text is sent. */
async function pickOther(): Promise<void> {
  other.value = multiple.value ? !other.value : true
  if (!other.value) {
    emit('update:customValue', '')
    return
  }
  if (!multiple.value) emit('update:modelValue', undefined)
  await nextTick()
  otherInput.value?.focus()
}
</script>

<template>
  <fieldset class="question-options" :aria-describedby="describedBy">
    <legend class="question-field-label">
      {{ fieldTitle(field) }}<span v-if="field.required" class="question-required" aria-hidden="true">*</span>
    </legend>
    <label v-for="option in options" :key="option.value" class="question-option">
      <input :type="multiple ? 'checkbox' : 'radio'" :name="name" :value="option.value" :checked="isChecked(option.value)" @change="pick(option.value)">
      <span class="question-option-text">
        <span class="question-option-label">{{ option.text }}<span v-if="option.recommended" class="question-badge">Recommended</span></span>
        <span v-if="option.description" class="question-option-description">{{ option.description }}</span>
      </span>
    </label>
    <template v-if="custom">
      <label class="question-option">
        <input :type="multiple ? 'checkbox' : 'radio'" :name="name" :checked="other" @change="pickOther">
        <span class="question-option-text"><span class="question-option-label">Other…</span></span>
      </label>
      <HstText
        v-if="other"
        ref="otherInput"
        class="question-other"
        aria-label="Your answer"
        :model-value="typeof customValue === 'string' ? customValue : ''"
        @update:model-value="emit('update:customValue', $event)"
      />
    </template>
  </fieldset>
</template>
