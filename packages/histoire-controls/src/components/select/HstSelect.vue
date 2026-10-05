<script setup lang="ts">
import type { HstControlOptions } from '../../options'
import type { HstControlLayout } from '../../types'
import { ref, useId } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import CustomSelect from './CustomSelect.vue'

defineOptions({ name: 'HstSelect', inheritAttrs: false })
defineProps<{
  /** Visible field label. */
  title?: string
  /** Exact runtime-owned selection. */
  modelValue?: any
  /** Choices including numeric values and disabled options. */
  options: HstControlOptions
  /** Disable selection. */
  disabled?: boolean
  /** Unmatched value hint. */
  placeholder?: string
  /** Shared field label placement. */
  layout?: HstControlLayout
}>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()
const generatedId = `histoire-select-${useId()}`
const select = ref<InstanceType<typeof CustomSelect>>()
/** Public focus targets actual select trigger. */
function focus(): void {
  select.value?.focus()
}
defineExpose({ focus })
</script>

<template>
  <HstWrapper :title="title" :layout="layout" :control-id="String($attrs.id ?? generatedId)" class="histoire-select" :class="$attrs.class" :style="$attrs.style" :data-histoire-control-type="$attrs['data-histoire-control-type']">
    <CustomSelect v-bind="Object.fromEntries(Object.entries($attrs).filter(([key]) => !['class', 'style', 'data-histoire-control-type'].includes(key)))" :id="String($attrs.id ?? generatedId)" ref="select" :title="title" :disabled="disabled" :placeholder="placeholder" :options="options" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
      <template #default="scope">
        <slot v-bind="scope">
          {{ scope.label ?? placeholder }}
        </slot>
      </template>
      <template #option="scope">
        <slot name="option" v-bind="scope">
          {{ scope.label }}
        </slot>
      </template>
    </CustomSelect>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
