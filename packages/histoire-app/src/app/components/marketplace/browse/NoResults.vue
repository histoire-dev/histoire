<script setup lang="ts">
import type { CatalogPage } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import BaseChip from '../../base/BaseChip.vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import { additions, categories, frameworkLabel } from './labels.js'

defineProps<{
  /** Known curated groups supplied by the response. */ collections: NonNullable<CatalogPage['discover']>['collections']
}>()
defineEmits<{
  /** Clear both search and every facet. */ clear: []
  /** Open the chosen returned collection. */ collection: [value: NonNullable<CatalogPage['discover']>['collections'][number]]
}>()
const store = useMarketplaceStore()
/** Describe actual active facets without inventing a query. */
const context = computed(() => [
  store.filters.value.category && categories[store.filters.value.category],
  ...(store.filters.value.frameworks?.map(frameworkLabel) ?? []),
  store.filters.value.officialOnly && 'Official only',
  ...(store.filters.value.adds?.map(kind => additions[kind]) ?? []),
].filter(Boolean).join(' · '))
</script>

<template>
  <div class="htw:mx-auto htw:flex htw:w-full htw:max-w-[920px] htw:flex-col htw:items-center htw:gap-[16px]">
    <WorkbenchEmptyState icon="search" title="No matches">
      <template v-if="store.query.value || context" #default>
        <span v-if="store.query.value">Nothing for <q>{{ store.query.value }}</q></span>
        <span v-if="context" class="htw:block">{{ context }}</span>
      </template>
      <template #actions>
        <HstButton v-if="!store.prefs.value.community" color="flat" aria-label="Include community plugins" @click="store.prefs.value.community = true">
          Include community plugins
        </HstButton>
        <HstButton color="flat" aria-label="Clear filters" @click="$emit('clear')">
          Clear filters
        </HstButton>
      </template>
    </WorkbenchEmptyState>
    <div v-if="collections.length" class="htw:flex htw:flex-wrap htw:items-center htw:justify-center htw:gap-[8px] htw:text-[12px]">
      <span class="htw:text-muted">Try</span><BaseChip v-for="collection in collections" :key="collection.id" as="button" tone="outline" :aria-label="`Try ${collection.title}`" @click="$emit('collection', collection)">
        {{ collection.title }}
      </BaseChip>
    </div>
    <div class="htw:mt-[32px] htw:box-border htw:flex htw:w-full htw:max-w-[560px] htw:items-center htw:gap-[14px] htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:px-[18px] htw:py-[16px]">
      <span aria-hidden="true" class="htw:grid htw:size-[36px] htw:shrink-0 htw:place-items-center htw:rounded-[10px] htw:bg-chip htw:text-body"><BuiltinIcon icon="code" :size="18" /></span>
      <div class="htw:min-w-0 htw:flex-1 htw:text-[13px]">
        <h3 class="htw:m-0 htw:text-[13px] htw:font-extrabold">
          Build it yourself
        </h3>
        <p class="htw:m-0 htw:text-muted">
          Workbench plugins add panes, inspector tabs and toolbar tools
        </p>
      </div>
      <HstButton as="a" href="https://histoire.dev/guide/plugins/development" target="_blank" rel="noopener noreferrer" class="htw:h-[28px] htw:shrink-0 htw:px-[10px] htw:text-[12px]">
        Plugin guide
      </HstButton>
    </div>
  </div>
</template>
