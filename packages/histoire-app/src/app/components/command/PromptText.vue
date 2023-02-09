<script lang="ts" setup>
import type { TextPrompt } from '@histoire/shared'
import { computed, ref } from 'vue'

const props = defineProps<{
  modelValue?: string
  prompt: TextPrompt
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const input = ref<HTMLInputElement>()

function focus () {
  input.value?.focus()
  input.value?.select()
}

defineExpose({
  focus,
})
</script>

<template>
  <div>
    <label class="htw-flex htw-flex-col htw-gap-2 htw-p-2">
      <span class="htw-px-2">
        <span>{{ prompt.label }}</span>
        <span
          v-if="prompt.required"
          class="htw-opacity-70"
        >*</span>
      </span>
      <input
        ref="input"
        v-model="model"
        class="htw-bg-transparent htw-w-full htw-p-2 htw-border htw-border-gray-500/50 focus:htw-border-primary-500/50 htw-rounded htw-outline-none"
        :required="prompt.required"
      >
    </label>
  </div>
</template>
