<script setup lang="ts">
import type { HstControlLayout } from '../../types'
import { computed, ref, useId } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import HstSimpleCheckbox from './HstSimpleCheckbox.vue'

defineOptions({ name: 'HstCheckbox' })
/** Existing string Boolean models remain supported. */
type Booleanish = boolean | 'true' | 'false'
const props = defineProps<{
  /** Exact public Boolean or string Boolean state. */
  modelValue?: Booleanish | null
  /** Accessible row label. */
  title?: string
  /** Block pointer and keyboard interaction. */
  disabled?: boolean
  /** Label placement. */
  layout?: HstControlLayout
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Booleanish] }>()
const labelId = `histoire-checkbox-${useId()}`
const row = ref()
/** Public focus targets checkbox row, never disabled controls. */
function focus(): void {
  if (!props.disabled) row.value?.$el.focus()
}
defineExpose({ focus })
const checked = computed(() => typeof props.modelValue === 'string' ? props.modelValue !== 'false' : Boolean(props.modelValue))
/** Preserve string-valued models while toggling exactly once. */
function toggle(): void {
  if (!props.disabled) emit('update:modelValue', typeof props.modelValue === 'string' ? checked.value ? 'false' : 'true' : !checked.value)
}
</script>

<template>
  <HstWrapper ref="row" :title="title" :layout="layout ?? 'horizontal'" tag="div" role="checkbox" :aria-labelledby="$slots.default ? labelId : undefined" :aria-label="$attrs['aria-label'] ?? title" :aria-checked="checked" :aria-disabled="disabled || undefined" :tabindex="disabled ? -1 : 0" class="histoire-checkbox" @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
    <HstSimpleCheckbox :model-value="checked" />
    <template v-if="$slots.default" #title>
      <span :id="labelId"><slot /></span>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
