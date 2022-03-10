<script lang="ts" setup>
import { computed, onMounted, PropType, ref, shallowRef, watch } from 'vue'
import { getHighlighter, Highlighter, setCDN } from 'shiki'
import { Icon } from '@iconify/vue'
import { generateSourceCode } from '../../codegen/vue3'
import type { Variant } from '../../types'
import { isDark } from '../../util/dark'
import { unindent } from '../../codegen/util'
import { useClipboard } from '@vueuse/core'

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

// Copy
const { copy, copied } = useClipboard()

const copySourceCode = () => copy(sourceCode.value)
</script>

<template>
  <div class="htw-bg-gray-100 dark:htw-bg-gray-800 htw-h-full htw-overflow-hidden htw-relative">
    <div
      v-if="error"
      class="htw-text-red-500 htw-h-full htw-p-2 htw-overflow-auto htw-font-mono htw-text-sm"
    >
      Error: {{ error }}
    </div>

    <textarea
      v-else-if="!sourceHtml"
      class="__histoire-code-placeholder htw-w-full htw-h-full htw-p-2.5 htw-outline-none htw-bg-transparent htw-resize-none htw-m-0"
      :value="sourceCode"
      readonly
    />
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-else
      class="__histoire-code htw-w-full htw-h-full htw-p-2.5 htw-overflow-auto"
      v-html="sourceHtml"
    />
    <!-- eslint-enable vue/no-v-html -->

    <!-- Toolbar -->
    <div
      v-if="!error"
      class="htw-absolute htw-top-2 htw-right-6 htw-p-1 htw-bg-gray-100 dark:htw-bg-gray-800"
    >
      <Icon
        v-tooltip="{
          content: 'Copied!',
          triggers: [],
          shown: copied,
          distance: 12,
        }"
        icon="cil:copy"
        class="htw-w-4 htw-h-4 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
        @click="copySourceCode()"
      />
    </div>
  </div>
</template>

<style scoped>
.__histoire-code-placeholder {
  color: inherit;
  font-size: inherit;
}
</style>
