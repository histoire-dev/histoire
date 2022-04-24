<script lang="ts" setup>
import { computed, onMounted, PropType, ref, shallowRef, watch } from 'vue'
import { getHighlighter, Highlighter, setCDN } from 'shiki'
import { HstCopyIcon } from '@histoire/controls'
import { generateSourceCode } from '../../codegen/vue3'
import type { Variant } from '../../types'
import { isDark } from '../../util/dark'
import { unindent } from '../../codegen/util'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },
})

const sourceCode = ref('')
const highlighter = shallowRef<Highlighter>()
const error = ref<string>(null)

onMounted(async () => {
  setCDN('https://unpkg.com/shiki/')
  highlighter.value = await getHighlighter({
    langs: [
      'html',
      'jsx',
    ],
    themes: [
      'github-light',
      'github-dark',
    ],
  })
})

watch(() => props.variant, async (value) => {
  error.value = null
  try {
    if (value.source) {
      sourceCode.value = value.source
    } else if (value.slots?.().source) {
      const source = value.slots?.().source()[0].children
      if (source) {
        sourceCode.value = await unindent(source)
      }
    } else {
      sourceCode.value = await generateSourceCode(value)
    }
  } catch (e) {
    console.error(e)
    error.value = e.message
  }
}, {
  deep: true,
  immediate: true,
})

const sourceHtml = computed(() => highlighter.value?.codeToHtml(sourceCode.value, {
  lang: 'html',
  theme: isDark.value ? 'github-dark' : 'github-light',
}))
</script>

<template>
  <div
    class="htw-bg-gray-100 dark:htw-bg-gray-800 htw-h-full htw-overflow-hidden htw-flex htw-flex-col"
  >
    <!-- Toolbar -->
    <div
      v-if="!error"
      class="htw-h-10 htw-flex-none htw-border-b htw-border-solid htw-border-gray-150 dark:htw-border-gray-850 htw-px-4 htw-flex htw-items-center"
    >
      <div class="htw-text-gray-900 dark:htw-text-gray-100">
        Source
      </div>
      <div class="htw-flex-1" />
      <HstCopyIcon
        :content="sourceCode"
        class="htw-flex-none"
      />
    </div>

    <div
      v-if="error"
      class="htw-text-red-500 htw-h-full htw-p-2 htw-overflow-auto htw-font-mono htw-text-sm"
    >
      Error: {{ error }}
    </div>

    <textarea
      v-else-if="!sourceHtml"
      class="__histoire-code-placeholder htw-w-full htw-h-full htw-p-4 htw-outline-none htw-bg-transparent htw-resize-none htw-m-0"
      :value="sourceCode"
      readonly
      data-test-id="story-source-code"
    />
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-else
      class="htw-w-full htw-h-full htw-overflow-auto"
      data-test-id="story-source-code"
    >
      <div
        class="__histoire-code htw-p-4 htw-w-fit"
        v-html="sourceHtml"
      />
    </div>
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>

<style scoped>
.__histoire-code-placeholder {
  color: inherit;
  font-size: inherit;
}
</style>
