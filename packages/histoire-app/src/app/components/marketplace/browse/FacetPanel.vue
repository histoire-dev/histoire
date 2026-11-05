<script setup lang="ts">
import type { CatalogPage } from '@histoire/shared'
import { HstButton, HstCheckbox } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { additions, categories, frameworkLabel } from './labels.js'
import { useCatalogFilters } from './use-catalog-filters.js'

const props = defineProps<{
  /** Available facet counts and detected stack. */ page: CatalogPage
}>()
const store = useMarketplaceStore()
const { toggle } = useCatalogFilters()
const frameworks = computed(() => [...new Set([...Object.keys(props.page.facets.frameworks), ...props.page.project.frameworks, ...(store.filters.value.frameworks ?? [])])])
</script>

<template>
  <aside aria-label="Plugin facets" class="htw:box-border htw:flex htw:w-[240px] htw:shrink-0 htw:flex-col htw:gap-[20px] htw:overflow-auto htw:border-0 htw:border-r htw:border-solid htw:border-border htw:bg-surface htw:p-[16px]">
    <div class="htw:flex htw:items-center htw:justify-between">
      <h2 class="htw:m-0 htw:text-[15px] htw:font-extrabold">
        Filters
      </h2>
      <HstButton color="flat" aria-label="Reset facets" class="htw:h-[28px] htw:px-[10px] htw:text-[12px]" @click="store.setFilters({})">
        Reset
      </HstButton>
    </div>
    <fieldset class="htw:m-0 htw:min-w-0 htw:border-0 htw:p-0">
      <legend class="htw:mb-[8px] htw:p-0 htw:text-[11px] htw:font-bold htw:tracking-[0.04em] htw:text-muted htw:uppercase">
        Category
      </legend>
      <div v-for="(label, category) in categories" :key="category" class="htw:flex htw:h-[30px] htw:items-center htw:gap-[8px]">
        <HstCheckbox :aria-label="`Category: ${label}`" :model-value="store.filters.value.category === category" class="htw:m-0 htw:min-w-0 htw:flex-1 htw:flex-row-reverse htw:p-0 htw:text-[13px]" @update:model-value="store.setFilters({ ...store.filters.value, category: $event ? category : undefined })">
          <span class="htw:font-sans htw:font-normal"><span class="htw:sr-only">Category: </span>{{ label }}</span>
        </HstCheckbox>
        <span class="htw:font-mono htw:text-[11px] htw:text-muted">{{ page.facets.category[category] }}</span>
      </div>
    </fieldset>
    <fieldset class="htw:m-0 htw:min-w-0 htw:border-0 htw:p-0">
      <legend class="htw:mb-[8px] htw:p-0 htw:text-[11px] htw:font-bold htw:tracking-[0.04em] htw:text-muted htw:uppercase">
        Framework
      </legend>
      <div v-for="framework in frameworks" :key="framework" class="htw:flex htw:h-[30px] htw:items-center htw:gap-[8px]">
        <HstCheckbox :aria-label="`Framework: ${frameworkLabel(framework)}`" :model-value="store.filters.value.frameworks?.includes(framework)" class="htw:m-0 htw:min-w-0 htw:flex-1 htw:flex-row-reverse htw:p-0 htw:text-[13px]" @update:model-value="toggle('frameworks', [framework], !!$event)">
          <span class="htw:font-sans htw:font-normal"><span class="htw:sr-only">Framework: </span>{{ frameworkLabel(framework) }}</span>
        </HstCheckbox>
        <span v-if="page.project.frameworks.includes(framework)" class="htw:text-[11px] htw:text-muted">detected</span>
        <span class="htw:font-mono htw:text-[11px] htw:text-muted">{{ page.facets.frameworks[framework] ?? 0 }}</span>
      </div>
    </fieldset>
    <fieldset class="htw:m-0 htw:min-w-0 htw:border-0 htw:p-0">
      <legend class="htw:mb-[8px] htw:p-0 htw:text-[11px] htw:font-bold htw:tracking-[0.04em] htw:text-muted htw:uppercase">
        Publisher
      </legend>
      <div class="htw:flex htw:h-[30px] htw:items-center htw:gap-[8px]">
        <HstCheckbox aria-label="Official only" :model-value="store.filters.value.officialOnly" class="htw:m-0 htw:min-w-0 htw:flex-1 htw:flex-row-reverse htw:p-0 htw:text-[13px]" @update:model-value="store.setFilters({ ...store.filters.value, officialOnly: !!$event || undefined })">
          <span class="htw:font-sans htw:font-normal">Official only</span>
        </HstCheckbox>
        <span class="htw:font-mono htw:text-[11px] htw:text-muted">{{ page.facets.official }}</span>
      </div>
    </fieldset>
    <fieldset class="htw:m-0 htw:min-w-0 htw:border-0 htw:p-0">
      <legend class="htw:mb-[8px] htw:p-0 htw:text-[11px] htw:font-bold htw:tracking-[0.04em] htw:text-muted htw:uppercase">
        Adds
      </legend>
      <div v-for="(label, kind) in additions" :key="kind" class="htw:flex htw:h-[30px] htw:items-center htw:gap-[8px]">
        <HstCheckbox :aria-label="`Adds: ${label}`" :model-value="store.filters.value.adds?.includes(kind)" class="htw:m-0 htw:min-w-0 htw:flex-1 htw:flex-row-reverse htw:p-0 htw:text-[13px]" @update:model-value="toggle('adds', [kind], !!$event)">
          <span class="htw:font-sans htw:font-normal"><span class="htw:sr-only">Adds: </span>{{ label }}</span>
        </HstCheckbox>
        <span class="htw:font-mono htw:text-[11px] htw:text-muted">{{ page.facets.adds[kind] }}</span>
      </div>
    </fieldset>
  </aside>
</template>
