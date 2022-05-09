<script lang="ts">
export default {
  name: 'CustomSelect',
}
</script>

<script lang="ts" setup>
import { Dropdown as VDropdown } from 'floating-vue'
import { ref, computed, ComputedRef } from 'vue'
import { Icon } from '@iconify/vue'

export type CustomSelectOptions = {
  label: string
  value: string
}

const props = defineProps<{
  modelValue: string
  options: Array<CustomSelectOptions> | Array<string>
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const formattedOptions: ComputedRef<CustomSelectOptions[]> =
  computed(() => props.options.map(option => typeof option === 'string'
    ? {
      label: option,
      value: option,
    } as CustomSelectOptions
    : option as CustomSelectOptions))

const dropdown = ref<HTMLElement>()
const selectedLabel = computed(() => formattedOptions.value.find((value) => value.value === props.modelValue)?.label)
const computedStyle = computed(() => {
  return {
    width: dropdown.value.scrollWidth + 'px',
  }
})

const select = ref<HTMLInputElement>()

function selectValue (value: string, hide: () => void) {
  emits('update:modelValue', value)
  hide()
}
</script>

<template>
  <VDropdown>
    <div
      ref="dropdown"
      class="htw-cursor-pointer htw-w-full htw-outline-none htw-px-2 htw-py-1 -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 hover:htw-border-primary-500 dark:hover:htw-border-primary-500 htw-rounded-sm htw-flex htw-gap-2 htw-w-full htw-items-center"
    >
      <slot>
        {{ selectedLabel }}
      </slot>
      <Icon
        icon="carbon:chevron-sort"
        class="htw-w-4 htw-h-4 htw-shrink-0 htw-ml-auto"
      />
    </div>
    <template #popper="{ hide }">
      <div
        :style="computedStyle"
        class="htw-flex htw-flex-col htw-bg-gray-50 dark:htw-bg-gray-700"
      >
        <div
          v-for="{ label, value } in formattedOptions"
          v-bind="{ ...$attrs, class: null, style: null }"
          :key="label"
          class="htw-px-2 htw-py-1 htw-cursor-pointer hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700"
          @click="selectValue(value, hide)"
        >
          {{ label }}
        </div>
      </div>
    </template>
  </VDropdown>
</template>

<style lang="postcss">
/* @TODO custom themes */

.v-popper {
  line-height: 0;
}

.v-popper--theme-dropdown {
  .htw-dark & {
    .v-popper__inner {
      @apply htw-bg-gray-700 htw-border-gray-850 htw-text-gray-100;
    }

    .v-popper__arrow-inner {
      @apply htw-border-gray-700;
    }

    .v-popper__arrow-outer {
      @apply htw-border-gray-850;
    }
  }

  &.v-popper__popper--show-from .v-popper__wrapper {
    transform: scale(.75);
  }

  &.v-popper__popper--show-to .v-popper__wrapper {
    transform: none;
    transition: transform .15s cubic-bezier(0, 1, .5, 1);
  }
}

.v-popper__popper:focus-visible {
  outline: none;
}

</style>
