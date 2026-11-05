<script setup lang="ts">
import type { Access, PluginDetail } from '@histoire/shared'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { frameworkLabel } from '../browse/labels.js'

defineProps<{
  /** Publisher metadata; access is declarative, never a permission grant. */ plugin: PluginDetail
}>()
const store = useMarketplaceStore()
/** Human-readable labels for every locked access capability. */
const accessLabels: Record<Access, string> = { 'story-frames': 'Story frames', 'story-dom': 'Story DOM', 'network': 'Network', 'filesystem': 'Filesystem', 'child-process': 'Child processes' }
</script>

<template>
  <aside aria-label="Plugin metadata" class="htw:box-border htw:flex htw:min-w-0 htw:flex-[1_1_260px] htw:flex-col htw:gap-[18px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-[18px]">
    <dl class="htw:m-0 htw:grid htw:grid-cols-[110px_minmax(0,1fr)] htw:gap-x-[12px] htw:gap-y-[10px]">
      <dt class="htw:text-muted">
        Version
      </dt>
      <dd class="htw:m-0 htw:overflow-x-auto htw:font-mono htw:text-[12px] htw:font-semibold htw:whitespace-nowrap">
        {{ plugin.latest }}
      </dd>
      <template v-if="plugin.updatedAt">
        <dt class="htw:text-muted">
          Updated
        </dt>
        <dd class="htw:m-0 htw:font-semibold">
          <time :datetime="plugin.updatedAt">{{ plugin.updatedAt.slice(0, 10) }}</time>
        </dd>
      </template>
      <dt class="htw:text-muted">
        License
      </dt>
      <dd class="htw:m-0 htw:font-semibold">
        {{ plugin.license ?? '—' }}
      </dd>
      <dt class="htw:text-muted">
        Requires
      </dt>
      <dd class="htw:m-0 htw:space-y-1 htw:font-mono htw:text-[12px] htw:font-semibold htw:wrap-anywhere">
        <div v-for="(range, name) in plugin.requires" :key="name">
          {{ name }} {{ range }}
        </div>
        <span v-if="!Object.keys(plugin.requires).length">—</span>
      </dd>
      <dt class="htw:text-muted">
        Frameworks
      </dt>
      <dd class="htw:m-0 htw:flex htw:flex-wrap htw:gap-[4px] htw:font-semibold">
        <span v-for="framework in plugin.frameworks" :key="framework" class="htw:inline-flex htw:h-[22px] htw:items-center htw:rounded-full htw:px-[9px] htw:text-[11px] htw:whitespace-nowrap" :class="store.page.value?.project.frameworks.includes(framework) ? 'htw:bg-accent-soft htw:text-accent-text' : 'htw:bg-chip htw:text-body'">{{ frameworkLabel(framework) }}</span>
        <span v-if="!plugin.frameworks.length">Any</span>
      </dd>
    </dl>
    <section aria-label="Declared access" class="htw:border-0 htw:border-t htw:border-solid htw:border-border htw:pt-[16px]">
      <h3 class="htw:m-0 htw:mb-[8px] htw:text-[12px] htw:font-extrabold htw:text-text">
        Access
      </h3>
      <p class="htw:m-0 htw:mb-[8px] htw:text-[12px] htw:text-muted">
        Declared by publisher
      </p>
      <ul v-if="plugin.access.length" class="htw:m-0 htw:flex htw:list-none htw:flex-col htw:gap-[6px] htw:p-0 htw:text-body">
        <li v-for="access in plugin.access" :key="access">
          {{ accessLabels[access] }}
        </li>
      </ul>
      <span v-else class="htw:text-body">None declared</span>
    </section>
    <a v-if="plugin.repoUrl" :href="plugin.repoUrl" target="_blank" rel="noopener noreferrer" class="htw:font-bold htw:text-accent-link htw:no-underline htw:hover:text-accent-text htw:focus-visible:outline-2 htw:focus-visible:outline-accent">Repository</a>
    <p v-if="plugin.provenance" class="htw:m-0 htw:rounded-lg htw:bg-chip htw:p-3 htw:text-[12px] htw:text-body">
      Published with npm provenance
    </p>
  </aside>
</template>
