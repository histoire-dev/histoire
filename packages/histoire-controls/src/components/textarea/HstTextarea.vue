<script setup lang="ts">
import type { HstControlLayout } from '../../types'
import { ref } from 'vue'
import { useControlField } from '../../field'
import HstWrapper from '../HstWrapper.vue'

defineOptions({ name: 'HstTextarea', inheritAttrs: false })
const props = defineProps<{
  /** Visible field label. */
  title?: string
  /** Current editable text. */
  modelValue?: string | null
  /** Label placement. */
  layout?: HstControlLayout
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLTextAreaElement>()
const { attrs, id, fieldAttrs, focus, select } = useControlField(input, () => props.title)
defineExpose({ focus, select, element: input })
</script>

<template>
  <HstWrapper :title="title" :layout="layout" :control-id="id()" class="histoire-textarea" :class="attrs.class" :style="attrs.style" :data-histoire-control-type="attrs['data-histoire-control-type']">
    <textarea ref="input" v-bind="fieldAttrs()" :value="modelValue" class="histoire-control-field" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
