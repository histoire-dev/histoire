<script setup lang="ts">
import type { MarkdownHeading } from './outline-dom.js'
import { HstButton } from '@histoire/controls/vue'

defineProps<{
  /** Current page's h2/h3 renderer anchors. */
  headings: MarkdownHeading[]
  /** Heading nearest current reading position. */
  active: string
}>()
defineEmits<{
  /** Local scroll intent with exact page-owned element. */
  select: [heading: MarkdownHeading]
}>()
</script>

<template>
  <nav v-if="headings.length" class="histoire-markdown-outline" aria-label="On this page">
    <h2>On this page</h2>
    <HstButton v-for="heading in headings" :key="heading.id" color="flat" type="button" :class="{ active: active === heading.id, nested: heading.level === 3 }" :aria-current="active === heading.id ? 'location' : undefined" @click="$emit('select', heading)">
      {{ heading.title }}
    </HstButton>
  </nav>
</template>

<style scoped>
.histoire-markdown-outline { position: sticky; top: 32px; align-self: start; padding-top: 72px; }
h2 { margin: 0 0 8px; color: var(--histoire-muted); font-size: 11px; font-weight: 700; }
button { display: block; width: 100%; padding: 6px 10px; border-left: 1px solid var(--histoire-border); color: var(--histoire-muted); text-align: left; }
button.active { border-left: 2px solid var(--histoire-accent); color: var(--histoire-text); font-weight: 700; }
button.nested { padding-left: 22px; font-size: 12px; }
button:hover { color: var(--histoire-accent-link); }
@media (max-width: 1100px) { .histoire-markdown-outline { display: none; } }
</style>
