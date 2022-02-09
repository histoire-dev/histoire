<script lang="ts" setup>
import { computed, onMounted, PropType, ref, shallowRef, watchEffect } from 'vue'
import { getHighlighter, Highlighter, setCDN } from 'shiki'
import { generateSourceCode } from '../codegen/vue3'
import { Variant } from '../types'
import { isDark } from '../util/dark'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },
})

const sourceCode = ref('')
const highlighter = shallowRef<Highlighter>()

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

watchEffect(async () => {
  sourceCode.value = await generateSourceCode(props.variant.slots().default?.({ state: props.variant.state }) ?? [])
})

const sourceHtml = computed(() => highlighter.value?.codeToHtml(sourceCode.value, {
  lang: 'html',
  theme: isDark.value ? 'github-dark' : 'github-light',
}))
</script>

<template>
  <div class="htw-bg-zinc-100 dark:htw-bg-zinc-800 htw-h-full">
    <textarea
      v-if="!sourceHtml"
      class="__histoire-code-placeholder htw-w-full htw-h-full htw-p-2 htw-outline-none htw-bg-transparent"
      :value="sourceCode"
      readonly
    />
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-else
      class="__histoire-code htw-w-full htw-h-full htw-p-2 htw-overflow-auto"
      v-html="sourceHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>

<style scoped>
.__histoire-code-placeholder {
  color: inherit;
  font-size: inherit;
}

.__histoire-code:deep(.shiki) {
  background: transparent !important;
}
</style>
