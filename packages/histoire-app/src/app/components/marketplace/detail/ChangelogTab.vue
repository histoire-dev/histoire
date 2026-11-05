<script setup lang="ts">
import type { PluginDetail, ReleaseNote } from '@histoire/shared'
import { computed } from 'vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'

const props = defineProps<{
  /** Latest release notes and validated repository URL. */ plugin: PluginDetail
}>()
/** Manifest kind names differ from the concise visible release labels. */
const labels: Record<ReleaseNote['kind'], string> = { breaking: 'Breaking', feature: 'New', fix: 'Fix' }
/** Resolve supported repository release pages from package-specific URLs. */
const releases = computed(() => {
  const repo = props.plugin.repoUrl
  if (!repo) return undefined
  const url = new URL(repo)
  // Official packages point at monorepo subdirectories, not repository roots.
  // GitLab keeps subgroup paths, whereas GitHub repositories have two segments.
  const path = url.pathname.replace(/\/$/, '').replace(/\.git$/, '')
  if (url.hostname === 'github.com') return `${url.origin}/${path.split('/').filter(Boolean).slice(0, 2).join('/')}/releases`
  if (url.hostname === 'gitlab.com') return `${url.origin}${path.split('/-/')[0]}/-/releases`
  return undefined
})
</script>

<template>
  <div class="htw:space-y-[18px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-[18px] htw:text-body">
    <template v-if="plugin.releaseNotes?.length">
      <h2 class="htw:m-0 htw:font-mono htw:text-[14px] htw:font-extrabold htw:text-text">
        {{ plugin.latest }}
      </h2>
      <ul class="htw:m-0 htw:list-none htw:space-y-[14px] htw:p-0">
        <li v-for="(note, index) in plugin.releaseNotes" :key="index" class="htw:space-y-2">
          <span class="htw:mr-2 htw:inline-flex htw:h-[22px] htw:items-center htw:rounded-full htw:bg-chip htw:px-[9px] htw:text-[11px] htw:font-semibold">{{ labels[note.kind] }}</span>{{ note.text }}
          <div v-if="note.code?.length" class="htw:flex htw:flex-wrap htw:gap-2">
            <code v-for="code in note.code" :key="code" class="htw:rounded htw:bg-chip htw:p-1 htw:font-mono htw:text-[12px]">{{ code }}</code>
          </div>
        </li>
      </ul>
    </template>
    <WorkbenchEmptyState v-else icon="document" title="No release notes" tone="neutral" />
    <a v-if="releases" :href="releases" target="_blank" rel="noopener noreferrer" aria-label="Repository releases" class="htw:inline-block htw:font-bold htw:text-accent-link htw:no-underline htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent">Repository releases</a>
  </div>
</template>
