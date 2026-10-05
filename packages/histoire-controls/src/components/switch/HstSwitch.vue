<script setup lang="ts">
import type { HstControlLayout } from '../../types'
import { ref } from 'vue'
import { useControlField } from '../../field'
import HstWrapper from '../HstWrapper.vue'

defineOptions({ name: 'HstSwitch', inheritAttrs: false })
const props = defineProps<{
  /** Accessible visible switch label. */
  title?: string
  /** Current Boolean state. */
  modelValue?: boolean | null
  /** Explicit unavailable state. */
  disabled?: boolean
  /** Label placement; switches default to a horizontal row. */
  layout?: HstControlLayout
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const input = ref<HTMLInputElement>()
const { attrs, id, fieldAttrs, focus } = useControlField(input, () => props.title)
defineExpose({ focus, element: input })
</script>

<template>
  <HstWrapper :title="title" :layout="layout ?? 'horizontal'" :control-id="id()" class="histoire-switch" :class="attrs.class" :style="attrs.style" :data-histoire-control-type="attrs['data-histoire-control-type']">
    <input ref="input" v-bind="fieldAttrs()" type="checkbox" role="switch" :checked="Boolean(modelValue)" :disabled="disabled" class="histoire-switch-input" @change="!disabled && emit('update:modelValue', ($event.target as HTMLInputElement).checked)" @keydown.enter.prevent="!disabled && emit('update:modelValue', !modelValue)">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
