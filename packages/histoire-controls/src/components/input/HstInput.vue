<script lang="ts">
export default {
  name: 'HstInput',

  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import { ref } from 'vue'
import HstWrapper from '../HstWrapper.vue'

const props = defineProps<{
  title?: string
  modelValue: string | number
}>()

const emit = defineEmits({
  'update:modelValue': (newValue: string | number) => true,
})

const input = ref<HTMLInputElement>()
</script>

<template>
  <HstWrapper
    class="htw-cursor-text"
    :title="title"
    @click="input.focus()"
  >
    <input
      ref="input"
      :value="modelValue"
      class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none htw-px-2 htw-py-0 htw-border htw-border-solid htw-border-gray-300 dark:htw-border-gray-500 focus:htw-border-primary-500 dark:focus:htw-border-primary-500 htw-rounded-sm"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </HstWrapper>
</template>
