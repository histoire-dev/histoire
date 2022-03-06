<script lang="ts" setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
})

const emit = defineEmits({
  'update:modelValue': (newValue: string | number) => true,
})

const input = ref<HTMLInputElement>()
</script>

<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>

<template>
  <div
    class="htw-p-2 hover:htw-bg-primary-500/10 htw-cursor-text"
    :class="$attrs.class"
    :style="$attrs.style"
    @click="input.focus()"
  >
    <label
      v-if="$slots.default"
      class="htw-text-sm htw-px-2 htw-cursor-text"
    >
      <slot />
    </label>
    <input
      ref="input"
      v-bind="{ ...$attrs, style: null, class: null }"
      :value="modelValue"
      class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none htw-px-2 htw-py-0 htw-border htw-border-gray-300 dark:htw-border-gray-500 focus:htw-border-primary-500 dark:focus:htw-border-primary-500 htw-rounded-sm"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </div>
</template>
