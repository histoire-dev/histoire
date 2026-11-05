<script setup lang="ts">
import type { PluginDetail } from '@histoire/shared'
import BaseChip from '../../base/BaseChip.vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import { incompatibleReason } from '../shell/compatibility-reason.js'

defineProps<{
  /** Version-scoped compatibility and publication metadata. */ plugin: PluginDetail
}>()
</script>

<template>
  <ul v-if="plugin.versions.length" aria-label="Published versions" class="htw:m-0 htw:list-none htw:space-y-[14px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-[18px]">
    <li v-for="version in plugin.versions" :key="version.version" class="htw:flex htw:flex-wrap htw:items-center htw:gap-[12px]">
      <code class="htw:font-mono htw:text-[12px] htw:font-semibold htw:whitespace-nowrap htw:text-text">{{ version.version }}</code>
      <time v-if="version.date" :datetime="version.date" class="htw:text-muted htw:text-[12px]">{{ version.date.slice(0, 10) }}</time>
      <BaseChip v-if="version.deprecated" tone="warn">
        Deprecated
      </BaseChip>
      <span class="htw:ml-auto htw:text-muted htw:text-[12px]">{{ version.compatible ? 'Compatible' : incompatibleReason(version.reason) }}</span>
    </li>
  </ul>
  <WorkbenchEmptyState v-else icon="catalog" title="No versions" tone="neutral" />
</template>
