<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useCopy } from './use-copy.js'

defineProps<{
  /** Reviewed command or declarative snippet to copy verbatim. */ code: string
  /** Accessible name distinguishes commands from config snippets. */ label?: string
}>()
const { status, copy } = useCopy()
</script>

<template>
  <div class="htw:grid htw:gap-1">
    <div class="htw:flex htw:min-w-0 htw:items-start htw:gap-3 htw:rounded-xl htw:border htw:border-solid htw:border-border htw:bg-input htw:px-3 htw:py-2.5">
      <pre class="htw:m-0 htw:min-w-0 htw:flex-1 htw:overflow-auto htw:font-mono htw:text-xs htw:leading-7"><code>{{ code }}</code></pre>
      <HstButton color="flat" icon-only :aria-label="label ?? 'Copy'" @click="copy(code)">
        <BuiltinIcon icon="copy" :size="14" />
      </HstButton>
    </div>
    <span v-if="status" role="status" class="htw:text-xs htw:text-muted">{{ status }}</span>
  </div>
</template>
