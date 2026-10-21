<script setup lang="ts">
import { ref, watch } from 'vue'
import { renderAgentMarkdown } from './markdown.js'

const props = defineProps<{
  /** Agent markdown text. */
  text: string
  /** Text is still streaming; skip render caching. */
  streaming?: boolean
}>()
/** Last sanitized render; kept while a newer render is pending to avoid flicker. */
const html = ref('')
let generation = 0
watch(() => props.text, async (text) => {
  const current = ++generation
  try {
    const rendered = await renderAgentMarkdown(text, document, !props.streaming)
    if (current === generation) html.value = rendered
  }
  catch {
    if (current === generation) html.value = ''
  }
}, { immediate: true })
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderAgentMarkdown -->
  <div v-if="html" class="agent-markdown" v-html="html" />
  <p v-else class="agent-markdown plain">
    {{ text }}
  </p>
</template>

<style scoped>
.agent-markdown { font-size: 12px; line-height: 1.6; color: var(--histoire-body); overflow-wrap: anywhere; }
.agent-markdown.plain { margin: 0; white-space: pre-wrap; }
.agent-markdown :deep(:is(p, ul, ol, pre, blockquote, table)) { margin: 0 0 8px; }
.agent-markdown :deep(> :last-child) { margin-bottom: 0; }
.agent-markdown :deep(:is(ul, ol)) { padding-left: 18px; }
.agent-markdown :deep(code) { padding: 1px 4px; border-radius: 4px; background: var(--histoire-chip); font-size: 11px; }
.agent-markdown :deep(pre) { padding: 8px; border-radius: 6px; background: var(--histoire-chip); overflow: auto; }
.agent-markdown :deep(pre code) { padding: 0; background: none; }
.agent-markdown :deep(a) { color: var(--histoire-accent-link); }
.agent-markdown :deep(:is(h1, h2, h3, h4)) { margin: 8px 0 4px; font-size: 12px; }
.agent-markdown :deep(blockquote) { padding-left: 8px; color: var(--histoire-muted); }
</style>
