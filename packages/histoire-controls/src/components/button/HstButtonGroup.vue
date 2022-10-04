<script lang="ts">
export default {
  name: 'HstButtonGroup',
}
</script>

<script setup lang="ts">
import { computed, ComputedRef } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import { HstControlOption } from '../../types'
import HstButton from './HstButton.vue'

const props = defineProps<{
  title?: string
  modelValue: string
  options: HstControlOption[]
}>()

const formattedOptions: ComputedRef<Record<string, string>> = computed(() => {
  if (Array.isArray(props.options)) {
    return Object.fromEntries(props.options.map((value: string | HstControlOption) => {
      if (typeof value === 'string') {
        return [value, value]
      } else {
        return [value.value, value.label]
      }
    }))
  }
  return props.options
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function selectOption (value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <HstWrapper
    tag="div"
    role="group"
    :title="title"
    class="htw-flex-nowrap"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div class="htw-flex">
      <HstButton
        v-for="( label, value ) in formattedOptions"
        :key="value"
        class="htw-p-1 htw-flex-1 first:htw-rounded-l-sm last:htw-rounded-r-sm"
        :primary="value === modelValue"
        :rounded="false"
        @click="selectOption(value)"
      >
        {{ label }}
      </HstButton>
    </div>
    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
