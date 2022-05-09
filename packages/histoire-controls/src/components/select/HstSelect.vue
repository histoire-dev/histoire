<script lang="ts">
export default {
  name: 'HstSelect',
}
</script>

<script lang="ts" setup>
import { ref } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import CustomSelect from './CustomSelect.vue'

const props = defineProps<{
  title?: string
  modelValue: string
  options: Record<string, string> | Array<string>
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
  </HstWrapper>
</template>
