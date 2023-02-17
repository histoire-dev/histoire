<script lang="ts">
export default {
  name: 'HstSelect',
}
</script>

<script lang="ts" setup>
import HstWrapper from '../HstWrapper.vue'
import CustomSelect from './CustomSelect.vue'
import { HstControlOption } from '../../types'

defineProps<{
  title?: string
  modelValue?: any
  options: Record<string, any> | string[] | HstControlOption[]
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()
</script>

<template>
  <HstWrapper
    :title="title"
    class="histoire-select htw-cursor-text htw-items-center"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <CustomSelect
      :options="options"
      :model-value="modelValue"
      @update:model-value="emits('update:modelValue', $event)"
    />

    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
