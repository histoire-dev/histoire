<script setup lang="ts">
import type { HstControlOptions } from '../../options'
import type { HstControlLayout } from '../../types'
import { computed, ref, useId } from 'vue'
import { normalizeControlOptions } from '../../options'
import HstWrapper from '../HstWrapper.vue'
import HstSimpleCheckbox from './HstSimpleCheckbox.vue'

defineOptions({ name: 'HstCheckboxList', inheritAttrs: false })
const props = defineProps<{
  /** Visible group name. */
  title?: string
  /** Current selected values. */
  modelValue: string[]
  /** Option labels and exact values. */
  options: HstControlOptions
  /** Disable group interaction. */
  disabled?: boolean
  /** Label placement. */
  layout?: HstControlLayout
}>()
const choices = ref<HTMLElement>()
/** Group focus lands on current enabled choice; disabled groups stay inert. */
function focus(): void {
  if (props.disabled) return
  const current = choices.value?.querySelector<HTMLElement>('input:checked:not(:disabled)')
  ;(current ?? choices.value?.querySelector<HTMLElement>('input:not(:disabled)'))?.focus()
}
defineExpose({ focus })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const options = computed(() => normalizeControlOptions(props.options))
const groupId = useId()
/** Selection changes retain original public values. */
function choose(value: string): void {
  if (props.disabled) return
  emit('update:modelValue', props.modelValue.includes(value) ? props.modelValue.filter(item => item !== value) : [...props.modelValue, value])
}
</script>

<template>
  <HstWrapper tag="div" v-bind="$attrs" role="group" :aria-label="$attrs['aria-label'] ?? title" :title="title" :layout="layout" class="histoire-checkbox-list">
    <div ref="choices" class="histoire-choice-list">
      <label v-for="(option, index) in options" :key="index"><input :name="groupId" type="checkbox" :value="option.value" :checked="modelValue.includes(option.value)" :disabled="disabled || option.disabled" @change="!option.disabled && choose(option.value)"><HstSimpleCheckbox :model-value="modelValue.includes(option.value)" />{{ option.label }}</label>
    </div>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
