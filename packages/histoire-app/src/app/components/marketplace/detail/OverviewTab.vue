<script setup lang="ts">
import type { PluginDetail } from '@histoire/shared'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import { additions } from '../browse/labels.js'

defineProps<{
  /** Plain text description and publisher-declared contributions. */ plugin: PluginDetail
}>()
</script>

<template>
  <div class="htw:flex htw:flex-col htw:gap-[20px]">
    <p class="htw:m-0 htw:max-w-[640px] htw:text-[14px] htw:text-body">
      {{ plugin.summary }}
    </p>
    <section aria-label="Adds to your workbench">
      <h2 class="htw:m-0 htw:mb-[10px] htw:text-[14px] htw:font-extrabold htw:text-text">
        Adds to your workbench
      </h2>
      <ul v-if="plugin.adds.length" class="htw:m-0 htw:grid htw:list-none htw:grid-cols-1 htw:gap-[10px] htw:p-0 htw:sm:grid-cols-3">
        <li v-for="(add, index) in plugin.adds" :key="index" class="htw:flex htw:flex-col htw:gap-[4px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-[14px]">
          <h3 class="htw:m-0 htw:text-[13px] htw:font-extrabold htw:text-text">
            {{ additions[add.kind] }}
          </h3>
          <span class="htw:text-muted">{{ add.text }}</span>
        </li>
      </ul>
      <WorkbenchEmptyState v-else icon="plug" title="No declared contributions" tone="neutral" />
    </section>
  </div>
</template>
