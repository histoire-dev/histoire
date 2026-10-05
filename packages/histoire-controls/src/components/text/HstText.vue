<script setup lang="ts">
import type { HstControlLayout } from '../../types'
import { ref } from 'vue'
import { useControlField } from '../../field'
import HstWrapper from '../HstWrapper.vue'

defineOptions({ name: 'HstText', inheritAttrs: false })
const props = defineProps<{
  /** Visible field label. */
  title?: string
  /** Current editable text. */
  modelValue?: string | null
  /** Label placement. */
  layout?: HstControlLayout
  /** Native text input type, including search and password. */
  type?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLInputElement>()
const { attrs, id, fieldAttrs, focus, select } = useControlField(input, () => props.title)
defineExpose({ focus, select, element: input })
</script>

<template>
  <HstWrapper :title="title" :layout="layout" :control-id="id()" class="histoire-text" :class="attrs.class" :style="attrs.style" :data-histoire-control-type="attrs['data-histoire-control-type']">
    <input ref="input" v-bind="fieldAttrs()" :type="type ?? 'text'" :value="modelValue" class="histoire-control-field" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
