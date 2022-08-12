<script lang="ts" setup>
import { computed, markRaw, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { Icon } from '@iconify/vue'
import { getHighlighter, Highlighter, setCDN } from 'shiki'
import { HstCopyIcon } from '@histoire/controls'
import { unindent } from '@histoire/shared'
// @ts-expect-error virtual module
import { clientSupportPlugins } from 'virtual:$histoire-support-plugins-client'
import type { Variant, Story } from '../../types'
import { isDark } from '../../util/dark'
import BaseEmpty from '../base/BaseEmpty.vue'

const props = defineProps<{
  story: Story
  variant: Variant
}>()

const generateSourceCodeFn = ref(null)

watchEffect(async () => {
  const clientPlugin = clientSupportPlugins[props.story.file?.supportPluginId]
  if (clientPlugin) {
    const pluginModule = await clientPlugin()
    generateSourceCodeFn.value = markRaw(pluginModule.generateSourceCode)
  }
})

const sourceCode = ref('')
const highlighter = shallowRef<Highlighter>()
const error = ref<string>(null)

onMounted(async () => {
  setCDN('https://unpkg.com/shiki@0.10.1/')
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

watch(() => [props.variant, generateSourceCodeFn.value], async () => {
  if (!generateSourceCodeFn.value) return
  error.value = null
  try {
    if (props.variant.source) {
      sourceCode.value = props.variant.source
    } else if (props.variant.slots?.().source) {
      const source = props.variant.slots?.().source()[0].children
      if (source) {
        sourceCode.value = await unindent(source)
      }
    } else {
      sourceCode.value = await generateSourceCodeFn.value(props.variant)
    }
  } catch (e) {
    console.error(e)
    error.value = e.message
  }
}, {
  deep: true,
  immediate: true,
})

const sourceHtml = computed(() => sourceCode.value
  ? highlighter.value?.codeToHtml(sourceCode.value, {
    lang: 'html',
    theme: isDark.value ? 'github-dark' : 'github-light',
  })
  : '')
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

    <BaseEmpty v-else-if="!sourceCode">
      <Icon
        icon="carbon:code-hide"
        class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-6"
      />
      <span>Not available</span>
    </BaseEmpty>

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
