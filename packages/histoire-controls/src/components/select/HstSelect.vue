<script lang="ts">
export default {
  name: 'HstSelect',
}
</script>

<script lang="ts" setup>
import { ref, computed, ComputedRef, PropType } from 'vue'
import HstWrapper from '../HstWrapper.vue'

export interface HstSelectOptions {
  label: string
  value: string
}

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  modelValue: {
    type: String,
    default: null,
  },
  options: {
    type: Array as PropType<HstSelectOptions[] | string[]>,
    required: true,
    default: () => [],
  },
})

const formattedOtions: ComputedRef<HstSelectOptions[]> =
  computed(() => props.options.map(option => typeof option === 'string' ? { label: option, value: option } as HstSelectOptions : option as HstSelectOptions))

const emit = defineEmits({
  'update:modelValue': (newValue: string) => true,
})

const select = ref<HTMLInputElement>()
</script>

<template>
  <HstWrapper
    :title="title"
    class="htw-cursor-text htw-items-center"
    :class="$attrs.class"
    :style="$attrs.style"
    @click="select.focus()"
  >
    <select
      ref="select"
      class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none htw-px-2 htw-py-1 -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 focus:htw-border-primary-500 dark:focus:htw-border-primary-500 htw-rounded-sm"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
      <option
        v-for="{ label, value } in formattedOtions"
        v-bind="{ ...$attrs, class: null, style: null }"
        :key="label"
        class="dark:htw-bg-gray-600"
        :value="value"
      >
        {{ label }}
      </option>
    </select>
  </HstWrapper>
</template>
