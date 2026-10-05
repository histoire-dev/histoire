<script setup lang="ts">
import { HstSelect } from '@histoire/controls/vue'

/** Legacy select adapter retaining select event and presentation slots. */
defineProps<{ modelValue: string, options: Record<string, string> | string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string], 'select': [value: string] }>()
</script>

<template>
  <HstSelect layout="inline" class="histoire-base-select" :model-value="modelValue" :options="options" @update:model-value="emit('update:modelValue', $event); emit('select', $event)">
    <template #default="scope">
      <slot v-bind="scope">
        {{ scope.label }}
      </slot>
    </template>
    <template #option="scope">
      <slot name="option" v-bind="scope">
        {{ scope.label }}
      </slot>
    </template>
  </HstSelect>
</template>
