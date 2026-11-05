<script setup lang="ts">
import type { ReleaseNote } from '@histoire/shared'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'

defineProps<{
  /** Notes from every intervening release, newest first. */ notes: ReleaseNote[]
}>()
/** Manifest kind labels match the approved update dialog. */
const labels = { breaking: 'Breaking', feature: 'New', fix: 'Fix' }
</script>

<template>
  <ul v-if="notes.length" aria-label="Release notes" class="htw:m-0 htw:list-none htw:p-0">
    <li v-for="(note, index) in notes" :key="index" class="htw:flex htw:items-baseline htw:gap-2.5 htw:py-1.5">
      <span class="htw:inline-flex htw:h-[22px] htw:shrink-0 htw:items-center htw:rounded-full htw:px-[9px] htw:text-[11px] htw:font-semibold" :class="note.kind === 'breaking' ? 'htw:bg-warn/10 htw:text-warn' : note.kind === 'feature' ? 'htw:bg-accent-soft htw:text-accent-text' : 'htw:bg-chip htw:text-body'">{{ labels[note.kind] }}</span>
      <div class="htw:min-w-0 htw:break-words">
        <p class="htw:m-0">
          {{ note.text }}
        </p><code v-for="code in note.code" :key="code" class="htw:mr-2 htw:font-mono htw:text-[12px]">{{ code }}</code>
      </div>
    </li>
  </ul>
  <WorkbenchEmptyState v-else icon="document" title="No release notes" tone="neutral" />
</template>
