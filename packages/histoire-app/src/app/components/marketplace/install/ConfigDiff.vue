<script setup lang="ts">
import type { ChangePlan } from '@histoire/shared'
import { BuiltinIcon } from '@histoire/controls/vue'

defineProps<{
  /** Exact planner output, shared by install and update review. */ files: ChangePlan['files']
  /** Review groups files into disclosure rows; first file starts expanded. */ collapsible?: boolean
}>()
</script>

<template>
  <div aria-label="File changes" :class="collapsible ? 'htw:overflow-hidden htw:rounded-xl htw:border htw:border-solid htw:border-border' : 'htw:grid htw:gap-3'">
    <component :is="collapsible ? 'details' : 'section'" v-for="(file, fileIndex) in files" :key="file.path" :aria-label="file.path" :open="collapsible && fileIndex === 0 ? true : undefined" class="htw:group htw:min-w-0 htw:overflow-hidden htw:border-solid htw:border-border" :class="collapsible ? 'htw:border-0 htw:border-t htw:first:border-t-0' : 'htw:rounded-xl htw:border'">
      <component :is="collapsible ? 'summary' : 'h3'" class="htw:m-0 htw:flex htw:list-none htw:flex-wrap htw:items-center htw:gap-3 htw:px-3 htw:py-2.5 htw:font-mono htw:text-xs htw:font-semibold" :class="collapsible ? 'htw:cursor-pointer htw:bg-surface htw:focus-visible:outline-2 htw:focus-visible:outline-accent htw:focus-visible:-outline-offset-2' : 'htw:bg-canvas'">
        <BuiltinIcon v-if="collapsible" icon="chevron-right" :size="14" class="htw:shrink-0 htw:group-open:rotate-90" />
        <span class="htw:min-w-0 htw:flex-1 htw:break-all">{{ file.path }}</span>
        <span class="htw:font-sans htw:font-normal htw:text-muted">+{{ file.added }} lines</span>
        <span v-if="file.removed" class="htw:font-sans htw:font-normal htw:text-danger-text">−{{ file.removed }} lines</span>
      </component>
      <pre class="htw:m-0 htw:overflow-auto htw:bg-input htw:py-3 htw:font-mono htw:text-xs htw:leading-7"><code><span v-for="(line, index) in file.lines" :key="index" class="htw:flex htw:min-w-max htw:pr-3.5" :class="line.kind === 'add' ? 'htw:bg-accent-soft' : line.kind === 'del' ? 'htw:bg-danger-soft' : ''"><span aria-hidden="true" class="htw:w-7 htw:shrink-0 htw:text-center" :class="line.kind === 'add' ? 'htw:text-accent-text' : line.kind === 'del' ? 'htw:text-danger-text' : 'htw:text-muted'">{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ' }}</span>{{ line.text }}</span></code></pre>
    </component>
  </div>
</template>
