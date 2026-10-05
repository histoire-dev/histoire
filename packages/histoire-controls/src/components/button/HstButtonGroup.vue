<script setup lang="ts">
import type { HstControlOptions } from '../../options'
import type { HstControlLayout } from '../../types'
import { computed, ref } from 'vue'
import { normalizeControlOptions } from '../../options'
import HstWrapper from '../HstWrapper.vue'
import HstButton from './HstButton.vue'

defineOptions({ name: 'HstButtonGroup', inheritAttrs: false })
const props = defineProps<{
  /** Visible group name. */
  title?: string
  /** Exact selected value. */
  modelValue?: any
  /** Supported option forms. */
  options: HstControlOptions
  /** Disable every option while owner is busy. */
  disabled?: boolean
  /** Label placement. */
  layout?: HstControlLayout
}>()
const options = computed(() => normalizeControlOptions(props.options))
const choices = ref<HTMLElement>()
/** Group focus lands on current enabled choice; disabled groups stay inert. */
function focus(): void {
  if (props.disabled) return
  const current = choices.value?.querySelector<HTMLElement>('button[aria-pressed="true"]:not(:disabled)')
  ;(current ?? choices.value?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus()
}
defineExpose({ focus })
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()
</script>

<template>
  <HstWrapper tag="div" role="group" v-bind="$attrs" :aria-label="$attrs['aria-label'] ?? title" :title="title" :layout="layout" class="histoire-button-group">
    <div ref="choices" class="histoire-button-group-options">
      <HstButton v-for="(option, index) in options" :key="index" color="flat" :disabled="disabled || option.disabled" :aria-label="option.label" :title="option.label" :aria-pressed="Object.is(option.value, modelValue)" @click="!disabled && !option.disabled && emit('update:modelValue', option.value)">
        {{ option.label }}
      </HstButton>
    </div>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
