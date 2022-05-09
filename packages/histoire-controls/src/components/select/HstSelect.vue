<script lang="ts">
export default {
  name: 'HstSelect',
}
</script>

<script lang="ts" setup>
import { Dropdown as VDropdown } from 'floating-vue'
import { ref, computed, ComputedRef, PropType } from 'vue'
import HstWrapper from '../HstWrapper.vue'
import { Icon } from '@iconify/vue'

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

const formattedOptions: ComputedRef<HstSelectOptions[]> =
  computed(() => props.options.map(option => typeof option === 'string' ? { label: option, value: option } as HstSelectOptions : option as HstSelectOptions))

const dropdown = ref<HTMLElement>()
const selectedLabel = computed(() => formattedOptions.value.find((value) => value.value === props.modelValue)?.label)
const computedStyle = computed(() => {
  return {
    width: dropdown.value.scrollWidth + 'px',
  }
})

const emits = defineEmits({
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
  >
    <VDropdown>
      <div
        ref="dropdown"
        class="htw-cursor-pointer htw-w-full htw-outline-none htw-px-2 htw-py-1 -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 hover:htw-border-primary-500 dark:hover:htw-border-primary-500 htw-rounded-sm htw-flex htw-gap-2 htw-flex-wrap htw-w-full htw-items-center"
      >
        {{ selectedLabel }}
        <Icon
          icon="carbon:chevron-sort"
          class="htw-w-4 htw-h-4 htw-shrink-0 htw-ml-auto"
        />
      </div>
      <template #popper="{ hide }">
        <div
          :style="computedStyle"
          class="htw-flex htw-flex-col"
        >
          <div
            v-for="{ label, value } in formattedOptions"
            v-bind="{ ...$attrs, class: null, style: null }"
            :key="label"
            class="htw-px-2 htw-py-1 htw-cursor-pointer hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700"
            @click="emits('update:modelValue', value)"
          >
            {{ label }}
          </div>
        </div>
      </template>
    </VDropdown>
  </HstWrapper>
</template>
