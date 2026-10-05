<script lang="ts" setup>
import type { SelectPrompt, SelectPromptOption } from '@histoire/shared'
import { getControlElement, HstButton, HstText } from '@histoire/controls/vue'
import { Icon } from '@iconify/vue'
import { computed, ref, watchEffect } from 'vue'
import { useSelection } from '../../util/select.js'
import BaseKeyboardShortcut from '../base/BaseKeyboardShortcut.vue'

const props = defineProps<{
  modelValue?: string
  prompt: SelectPrompt
  answers: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'next'): void
}>()

const model = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value)
    emit('next')
  },
})

const input = ref<HTMLInputElement>()

function focus() {
  input.value?.focus()
  input.value?.select()
}

defineExpose({
  focus,
})

const search = ref('')

const options = ref<SelectPromptOption[]>([])

let requestId = 0
watchEffect(async () => {
  if (typeof props.prompt.options === 'function') {
    const rId = ++requestId
    const result = await props.prompt.options(search.value, props.answers)
    if (rId === requestId) {
      options.value = result
    }
  }
  else {
    options.value = props.prompt.options
  }
})

const formattedOptions = computed(() => {
  return options.value.map((option) => {
    if (typeof option === 'string') {
      return {
        value: option,
        label: option,
      }
    }
    else {
      return option
    }
  })
})

// Keyboard navigation

const {
  selectedIndex,
  selectNext,
  selectPrevious,
} = useSelection(formattedOptions)

function selectIndex(index: number) {
  const result = formattedOptions.value[index].value
  if (result) {
    model.value = result
  }
}
</script>

<template>
  <div class="histoire-prompt-select htw-relative htw-group">
    <HstText
      v-model="model"
      layout="inline"
      :required="prompt.required"
      tabindex="-1"
      class="htw-absolute htw-inset-0 htw-opacity-0 htw-pointer-events-none"
    />
    <label class="htw-flex htw-flex-col htw-gap-2 htw-p-2">
      <span class="htw-px-2 htw-flex">
        <span>{{ prompt.label }}</span>
        <span
          v-if="prompt.required"
          class="htw-opacity-70"
        >*</span>

        <span class="htw-opacity-40 htw-text-sm htw-ml-auto htw-invisible group-focus-within:htw-visible">
          Press <BaseKeyboardShortcut shortcut="Space" /> to select
        </span>
      </span>
      <HstText
        :ref="value => { input = getControlElement(value) as HTMLInputElement }"
        v-model="search"
        layout="inline"
        class="htw-w-full"
        @keydown.down.prevent="selectNext()"
        @keydown.up.prevent="selectPrevious()"
        @keydown.space.prevent="selectIndex(selectedIndex)"
      />
    </label>

    <div class="htw-overflow-auto max-h-[300px] htw-mb-2">
      <HstButton
        v-for="(option, index) of formattedOptions"
        :key="option.value"
        color="flat"
        type="button"
        tabindex="-1"
        :class="[
          model === option.value
            ? 'htw-bg-primary-500/20'
            : index === selectedIndex
              ? 'htw-bg-primary-500/10'
              : 'htw-bg-transparent',
        ]"
        class="htw-w-full htw-text-left htw-px-4 htw-py-2 hover:htw-bg-primary-500/10 htw-flex htw-items-center"
        @click="model = option.value"
      >
        <span class="htw-flex-1">{{ option.label }}</span>

        <Icon
          v-if="model === option.value"
          icon="carbon:checkmark"
          class="htw-w-4 htw-h-4 htw-text-primary-500"
        />
      </HstButton>
    </div>
  </div>
</template>
