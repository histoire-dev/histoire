<script lang="ts">
export default {
  name: 'HstDate',
}
</script>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import HstWrapper from '../HstWrapper.vue'

const props = defineProps<{
  title?: string
  datetime?: boolean
  modelValue?: Date | null
}>()

const emit = defineEmits({
  'update:modelValue': (newValue: Date | null) => true,
  'update:dateString': (newValue: string) => true,
})

let initialValue = ''
if (props.modelValue instanceof Date) {
  initialValue = props.datetime
    ? props.modelValue.toISOString().slice(0, 16)
    : props.modelValue.toISOString().slice(0, 10)
}
const inputValue = ref(initialValue)
const input = ref<HTMLInputElement>()

const dateType = computed(() => {
  return props.datetime ? 'datetime-local' : 'date'
})

function stringToDate(str: string): Date | null {
  const date = new Date(str)
  return Number.isNaN(date.getTime()) ? null : date
}

function onInputUpdate(event: Event) {
  const value = (event.target as HTMLInputElement).value
  inputValue.value = value
  emit('update:dateString', value)
  const date = stringToDate(value)
  emit('update:modelValue', date)
}
</script>

<template>
  <HstWrapper
    :title="title"
    class="histoire-text htw-cursor-text htw-items-center"
    :class="$attrs.class"
    :style="$attrs.style"
    @click="input.focus()"
  >
    <input
      ref="input"
      v-bind="{ ...$attrs, class: null, style: null }"
      :type="dateType"
      :value="inputValue"
      class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none htw-px-2 htw-py-1 -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 focus:htw-border-primary-500 dark:focus:htw-border-primary-500 htw-rounded-sm"
      @input="onInputUpdate"
    >

    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
