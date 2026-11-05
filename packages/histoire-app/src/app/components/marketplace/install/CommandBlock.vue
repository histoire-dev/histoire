<script setup lang="ts">
import { HstCopyIcon } from '@histoire/controls/vue'

defineProps<{
  /** Reviewed command or declarative snippet to copy verbatim. */ code: string
  /** Accessible name distinguishes commands from config snippets. */ label?: string
}>()
</script>

<template>
  <div class="htw:flex htw:min-w-0 htw:items-start htw:gap-3 htw:rounded-xl htw:border htw:border-solid htw:border-border htw:bg-input htw:px-3 htw:py-2.5">
    <pre class="htw:m-0 htw:min-w-0 htw:flex-1 htw:overflow-auto htw:font-mono htw:text-xs htw:leading-7"><code>{{ code }}</code></pre>
    <HstCopyIcon :content="code" :label="label" />
  </div>
</template>
