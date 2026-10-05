<script lang="ts">
export default {
  name: 'HstNumber',
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import type { HstControlLayout } from '../../types'
import { computed, onUnmounted, ref } from 'vue'
import { useControlField } from '../../field'
import HstWrapper from '../HstWrapper.vue'

const props = defineProps<{
  /** Visible numeric field label. */
  title?: string
  /** Shared label placement. */
  layout?: HstControlLayout
  /** Numeric state; native drafts retain browser number-input parsing. */
  modelValue?: number | null
}>()

const emit = defineEmits({
  'update:modelValue': (newValue: number) => true,
})

const numberModel = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value)
  },
})

const input = ref<HTMLInputElement>()

const { attrs, id, fieldAttrs, focus, select } = useControlField(input, () => props.title)
defineExpose({ focus, select, element: input })

/** Focus and select native numeric text without changing its value. */
function focusAndSelect(event: MouseEvent) {
  if (event.target === input.value) return
  focus()
  select()
}

// Drag to modify

const isDragging = ref(false)
let startX: number
let startValue: number

/** Drag only from row chrome; native input edits keep browser behavior. */
function onMouseDown(event: MouseEvent) {
  if (input.value?.disabled || input.value?.readOnly || event.target === input.value) return
  isDragging.value = true
  startX = event.clientX
  startValue = numberModel.value ?? 0
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', stopDragging)
}

/** Follow configured native step while drag ownership remains current. */
function onMouseMove(event: MouseEvent) {
  if (input.value?.disabled || input.value?.readOnly) return stopDragging()
  let step = Number.parseFloat(input.value.step)
  if (Number.isNaN(step)) {
    step = 1
  }
  numberModel.value = startValue + Math.round((event.clientX - startX) / 10 / step) * step
}

/** Remove document listeners on release, disable, or unmount. */
function stopDragging() {
  isDragging.value = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', stopDragging)
}

onUnmounted(() => {
  stopDragging()
})
</script>

<template>
  <HstWrapper
    class="histoire-number htw-cursor-ew-resize"
    :title="title"
    :layout="layout"
    :control-id="id()"
    :data-histoire-control-type="attrs['data-histoire-control-type']"
    :class="[
      $attrs.class,
      { 'htw-select-none': isDragging },
    ]"
    :style="$attrs.style"
    @click="focusAndSelect"
    @mousedown="onMouseDown"
  >
    <input
      ref="input"
      v-bind="fieldAttrs()"
      v-model.number="numberModel"
      type="number"
      :class="{
        'htw-select-none': isDragging,
      }"
      class="histoire-control-field"
    >

    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
