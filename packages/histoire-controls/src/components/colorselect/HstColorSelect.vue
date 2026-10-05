<script setup lang="ts">
import type { HstControlLayout } from '../../types'
import { useThrottleFn } from '@vueuse/core'
import { ref } from 'vue'
import { useControlField } from '../../field'
import HstWrapper from '../HstWrapper.vue'

defineOptions({ name: 'HstColorSelect', inheritAttrs: false })
const props = defineProps<{
  /** Shared label placement. */
  layout?: HstControlLayout
  /** Visible field label. */
  title?: string
  /** Preserve exact text drafts as well as native picker hex values. */
  modelValue?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLInputElement>()
const { attrs, id, fieldAttrs, focus, select } = useControlField(input, () => props.title)
defineExpose({ focus, select, element: input })
/** Native picker can publish rapidly; retain leading and trailing updates. */
const updateColor = useThrottleFn((value: string) => {
  if (!input.value?.disabled && !input.value?.readOnly) emit('update:modelValue', value)
}, 15, true, true)
</script>

<template>
  <HstWrapper :title="title" :layout="layout" :control-id="id()" class="histoire-color-select" :class="attrs.class" :style="attrs.style" :data-histoire-control-type="attrs['data-histoire-control-type']">
    <div class="histoire-color-fields">
      <input ref="input" v-bind="fieldAttrs()" type="text" :value="modelValue" class="histoire-control-field" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
      <input type="color" :value="modelValue ?? undefined" :disabled="Boolean(attrs.disabled || attrs.readonly)" :aria-label="`${title ?? 'Color'} picker`" @input="updateColor(($event.target as HTMLInputElement).value)">
    </div>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
