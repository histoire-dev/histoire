<script lang="ts">
export default {
  name: 'HstNumber',
}
</script>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import { useEventListener } from '@vueuse/core'

const props = defineProps<{
  title?: string
  modelValue: number
  integer?: boolean
}>()

const emit = defineEmits({
  'update:modelValue': (newValue: number) => true,
})

const internal = ref(0)

watch(() => props.modelValue, () => {
  internal.value = props.modelValue
}, { immediate: true })

const input = ref<HTMLInputElement>()

function focusAndSelect () {
  input.value.focus()
  input.value.select()
}

useEventListener(window, 'mousemove', mouseNumber, { passive: true })
useEventListener(window, 'mouseup', stopMouseNumber, { passive: true })

const isMouseMove = ref(false)

function startMouseNumber () {
  isMouseMove.value = true
}

function mouseNumber (event: MouseEvent) {
  const precision = 0.002

  if (!isMouseMove.value) {
    return
  }

  if (internal.value >= 0) {
    internal.value = (internal.value + 1) * (1 + precision * event.movementX) - 1
  } else {
    internal.value = (internal.value - 1) * (1 - precision * event.movementX) + 1
  }

  const newValue = props.integer ? Math.round(internal.value) : internal.value
  emit('update:modelValue', newValue)
}

function stopMouseNumber () {
  isMouseMove.value = false
}

function updateValue (event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value) {
    return // the value is an empty string if it's not a valid number (ex: "12."), we don't want to wipe it by emitting an empty string
  }
  emit('update:modelValue', props.integer ? parseInt(value) : parseFloat(value))
}
</script>

<template>
  <HstWrapper
    class="htw-cursor-ew-resize"
    :title="title"
    :class="{'htw-select-none': isMouseMove}"
    @click="focusAndSelect"
    @mousedown="startMouseNumber"
  >
    <input
      ref="input"
      type="number"
      size="12"
      :value="modelValue"
      :class="{'htw-select-none': isMouseMove}"
      class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none htw-px-2 htw-py-0 htw-border htw-border-solid htw-border-gray-300 dark:htw-border-gray-500 focus:htw-border-primary-500 dark:focus:htw-border-primary-500 htw-rounded-sm htw-cursor-ew-resize"
      @input="updateValue"
    >
  </HstWrapper>
</template>

<style scoped>
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type=number] {
  -moz-appearance: textfield;
}
</style>
