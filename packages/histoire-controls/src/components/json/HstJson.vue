<script lang="ts">
export default {
  name: 'HstJson',
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import HstWrapper from '../HstWrapper.vue'
import { getHighlighter, Highlighter, setCDN } from 'shiki'
import { VTooltip as vTooltip } from 'floating-vue'
import { isDark } from '../../utils'

const props = defineProps<{
  title?: string
  modelValue: unknown
}>()

const emits = defineEmits({
  'update:modelValue': (newValue: unknown) => true,
})

const internalValue = ref('')
const internalCode = ref('')
const invalidValue = ref(false)
const highlighter = ref<Highlighter>()
const input = ref<HTMLInputElement>()

onMounted(async () => {
  setCDN('https://unpkg.com/shiki@0.10.1/')
  highlighter.value = await getHighlighter({
    langs: ['json'],
    theme: isDark ? 'github-dark' : 'github-light',
  })
  updateInternalValue()
})

function updateInternalValue () {
  internalValue.value = JSON.stringify(props.modelValue, null, 2)
}

watch(() => props.modelValue, () => {
  if (!highlighter.value) {
    return
  }

  if (invalidValue.value || JSON.stringify(JSON.parse(internalValue.value)) !== JSON.stringify(props.modelValue)) {
    updateInternalValue()
  }
}, { deep: true })

watch(() => internalValue.value, () => {
  internalCode.value = highlighter.value?.codeToHtml(internalValue.value, { lang: 'json' })
  emitInput()
})

async function emitInput () {
  invalidValue.value = false
  try {
    emits('update:modelValue', JSON.parse(internalValue.value))
  } catch (e) {
    invalidValue.value = true
  }
}
</script>

<template>
  <HstWrapper
    :title="title"
    class="htw-cursor-text"
    :class="$attrs.class"
    :style="$attrs.style"
    @click="input.focus()"
  >
    <div
      class="__histoire-json-code htw-w-full htw-px-2 htw-py-1 -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 focus-within:htw-border-primary-500 dark:focus-within:htw-border-primary-500 htw-rounded-sm htw-box-border htw-overflow-y-auto htw-resize-y htw-min-h-[26px] htw-relative htw-h-16"
      v-bind="{ ...$attrs, class: null, style: null }"
    >
      <div class="htw-grid htw-min-h-full">
        <textarea
          ref="input"
          v-bind="{ ...$attrs, class: null, style: null }"
          v-model="internalValue"
          placeholder="Enter JSON"
          class="htw-bg-transparent htw-text-transparent htw-caret-black dark:htw-caret-white htw-w-full htw-min-h-full htw-font-inherit htw-text-xs htw-outline-none htw-resize-none htw-overflow-hidden htw-m-0 htw-p-0 placeholder:htw-text-gray-300 placeholder:dark:htw-text-gray-400"
        />
        <div
          ref="preview"
          class="__histoire-json-preview htw-text-xs htw-pointer-events-none"
          v-html="internalCode"
        />
      </div>
    </div>

    <template #actions>
      <Icon
        v-if="invalidValue"
        v-tooltip="'JSON error'"
        icon="carbon:warning-alt"
        class="htw-text-orange-500"
      />

      <slot name="actions" />
    </template>
  </HstWrapper>
</template>

<style scoped>
.__histoire-json-code {
  color: inherit;
  font-size: inherit;
}

.__histoire-json-code ::v-deep(.shiki) {
  background: transparent !important;
}

.__histoire-json-code textarea, .__histoire-json-preview {
  grid-area: 1 / 1 / 2 / 2;
}
</style>
