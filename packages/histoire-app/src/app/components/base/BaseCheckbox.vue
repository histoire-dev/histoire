<script setup lang="ts">
import { HstCheckbox } from '@histoire/controls/vue'

/** Legacy checkbox adapter delegates state and keyboard interaction. */
defineProps<{ modelValue?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <HstCheckbox class="histoire-base-checkbox" :model-value="modelValue" @update:model-value="emit('update:modelValue', Boolean($event))">
    <template v-if="$slots.default" #default>
      <slot />
    </template>
  </HstCheckbox>
</template>
