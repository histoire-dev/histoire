<script setup lang="ts">
import type { PluginDetail } from '@histoire/shared'
import { computed } from 'vue'
import ReleaseNotes from '../update/ReleaseNotes.vue'

const props = defineProps<{
  /** Latest release notes and validated repository URL. */ plugin: PluginDetail
}>()
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
    <h2 v-if="plugin.releaseNotes?.length" class="htw:m-0 htw:font-mono htw:text-[14px] htw:font-extrabold htw:text-text">
      {{ plugin.latest }}
    </h2>
    <ReleaseNotes :notes="plugin.releaseNotes ?? []" />
    <a v-if="releases" :href="releases" target="_blank" rel="noopener noreferrer" aria-label="Repository releases" class="htw:inline-block htw:font-bold htw:text-accent-link htw:no-underline htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent">Repository releases</a>
  </div>
</template>
