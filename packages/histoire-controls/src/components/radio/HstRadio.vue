<script lang="ts">
export default {
  name: 'HstRadio',
}
</script>

<script lang="ts" setup>
import { computed, ComputedRef, ref } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import { HstControlOption } from '../../types'

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

const input = ref<HTMLInputElement>()

function selectOption (value: string) {
  emit('update:modelValue', value)
  animationEnabled.value = true
}

// animationEnabled prevents the animation from triggering on mounted
const animationEnabled = ref(false)
</script>

<template>
  <HstWrapper
    role="group"
    :title="title"
    class="htw-cursor-text htw-items-center"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <template
      v-for="( label, value ) in formattedOptions"
      :key="value"
    >
      <input
        :id="`${value}-radio`"
        type="radio"
        :name="`${value}-radio`"
        :value="value"
        :checked="value === modelValue"
        class="htw-hidden"
        @change="selectOption(value)"
      >
      <label
        tabindex="0"
        :for="`${value}-radio`"
        class="htw-cursor-pointer htw-flex htw-items-center htw-relative htw-p-2"
        @keydown.enter.prevent="selectOption(value)"
        @keydown.space.prevent="selectOption(value)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          class="htw-relative htw-z-10 htw-border htw-border-solid group-active:htw-bg-gray-500/20 htw-text-inherit htw-rounded-full htw-box-border htw-inset-0 htw-transition-border htw-duration-150 htw-ease-out htw-mr-2"
        >
          <circle
            cx="12"
            cy="12"
            r="8"
            :class="[
              animationEnabled ? 'htw-transition-all' : 'htw-transition-none',
              {
                'htw-delay-150': modelValue === value,
              },
              modelValue === value
                ? 'htw-fill-primary-500'
                : 'htw-fill-transparent',
            ]"
          />
        </svg>
        {{ label }}
      </label>
    </template>

    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
