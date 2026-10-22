<script setup lang="ts">
import type { UiAgentElicitationField, UiAgentElicitationTextField, UiAgentElicitationValue } from '@histoire/shared'
import { HstNumber, HstSelect, HstText } from '@histoire/controls/vue'
import { computed, useId } from 'vue'
import { fieldTitle, isCompact } from './elicitation-fields.js'
import ElicitationOptions from './ElicitationOptions.vue'

const props = defineProps<{
  /** Projected agent form field. */
  field: UiAgentElicitationField
  /** Current value. */
  modelValue?: UiAgentElicitationValue
  /** Free-text field folded into a choice field's option list. */
  custom?: UiAgentElicitationTextField
  /** Free-text answer of the folded field. */
  customValue?: UiAgentElicitationValue
  /** Validation message. */
  error?: string
}>()
const emit = defineEmits<{
  /** New value from the control. */
  'update:modelValue': [value: UiAgentElicitationValue | undefined]
  /** New free-text answer of the folded field. */
  'update:customValue': [value: string]
}>()
/** Native input type per string format. */
const inputTypes: Record<string, string> = { 'email': 'email', 'uri': 'url', 'date': 'date', 'date-time': 'datetime-local' }
const id = `elicitation-field-${useId()}`
/** Hint and error ids announced with the control. */
const describedBy = computed(() => [props.field.description && `${id}-hint`, props.error && `${id}-error`].filter(Boolean).join(' ') || undefined)
/** Dropdown options; descriptions follow the label since a dropdown shows one line. */
const selectOptions = computed(() => props.field.type === 'choice' ? props.field.options.map(option => ({ value: option.value, label: option.description ? `${option.label} — ${option.description}` : option.label })) : [])
/** Current value narrowed per control. */
const text = computed(() => typeof props.modelValue === 'string' ? props.modelValue : undefined)
const number = computed(() => typeof props.modelValue === 'number' ? props.modelValue : undefined)
/** Shared attributes of the native control. */
const controlAttrs = computed(() => ({ 'id': id, 'aria-describedby': describedBy.value, 'aria-required': props.field.required || undefined, 'aria-invalid': props.error ? true : undefined }))
</script>

<template>
  <div class="elicitation-field">
    <ElicitationOptions
      v-if="(field.type === 'choice' || field.type === 'multi-choice') && !isCompact(field)"
      :field="field"
      :model-value="modelValue"
      :custom="custom"
      :custom-value="customValue"
      :described-by="describedBy"
      @update:model-value="emit('update:modelValue', $event)"
      @update:custom-value="emit('update:customValue', $event)"
    />
    <label v-else-if="field.type === 'boolean'" class="question-option">
      <input v-bind="controlAttrs" type="checkbox" :checked="modelValue === true" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
      <span class="question-option-label">{{ fieldTitle(field) }}<span v-if="field.required" class="question-required" aria-hidden="true">*</span></span>
    </label>
    <template v-else>
      <label :for="id" class="question-field-label">
        {{ fieldTitle(field) }}<span v-if="field.required" class="question-required" aria-hidden="true">*</span>
      </label>
      <HstSelect v-if="field.type === 'choice'" v-bind="controlAttrs" :options="selectOptions" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
      <HstNumber v-else-if="field.type === 'number'" v-bind="controlAttrs" :model-value="number" @update:model-value="emit('update:modelValue', $event)" />
      <HstText v-else v-bind="controlAttrs" :type="inputTypes[(field.type === 'text' && field.format) || ''] ?? 'text'" :model-value="text" @update:model-value="emit('update:modelValue', $event)" />
    </template>
    <p v-if="field.description" :id="`${id}-hint`" class="field-hint">
      {{ field.description }}
    </p>
    <p v-if="error" :id="`${id}-error`" class="field-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
