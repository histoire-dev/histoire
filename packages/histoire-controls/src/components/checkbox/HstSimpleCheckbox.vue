<script setup lang="ts">
import BuiltinIcon from '../BuiltinIcon.vue'

defineOptions({ name: 'HstSimpleCheckbox' })
const props = defineProps<{
  /** Current check presentation. */
  modelValue?: boolean
  /** Legacy standalone click interaction. */
  withToggle?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <span class="histoire-simple-checkbox" :data-checked="Boolean(modelValue)" aria-hidden="true" @click="props.withToggle && emit('update:modelValue', !modelValue)"><BuiltinIcon v-if="modelValue" icon="carbon:checkmark" :width="12" :height="12" /></span>
</template>
