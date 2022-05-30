<script lang="ts">
export default {
  name: 'HstSelect',
}

export type { SelectOption as HstSelectOption } from './CustomSelect.vue'
</script>

<script lang="ts" setup>
import { ref } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import CustomSelect, { SelectOption } from './CustomSelect.vue'

const props = defineProps<{
  title?: string
  modelValue: string
  options: Record<string, string> | string[] | SelectOption[]
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const select = ref<HTMLInputElement>()
</script>

<template>
  <HstWrapper
    :title="title"
    class="htw-cursor-text htw-items-center"
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
