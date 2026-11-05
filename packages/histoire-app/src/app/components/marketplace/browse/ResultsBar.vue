<script setup lang="ts">
import { BuiltinIcon, HstSelect, HstSwitch } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import { frameworkLabel } from './labels.js'
import { useCatalogFilters } from './use-catalog-filters.js'

const props = defineProps<{
  /** Total matches, including further result pages. */ total: number
  /** Detected framework identifiers. */ frameworks: string[]
  /** Retained curated group title for its removable constraint. */ collectionTitle?: string
}>()
const store = useMarketplaceStore()
const { chips: activeFilters, toggle, remove } = useCatalogFilters()
const chips = computed(() => activeFilters.value.map(chip => chip.field === 'collection' ? { ...chip, label: props.collectionTitle ?? chip.label } : chip))
const frameworkTitle = computed(() => `Works with ${props.frameworks.map(frameworkLabel).join(', ')}`)
const matchesProject = computed(() => props.frameworks.length > 0 && props.frameworks.every(value => store.filters.value.frameworks?.includes(value)))
</script>

<template>
  <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-[8px] htw:text-[13px]">
    <span aria-live="polite" class="htw:mr-[4px] htw:font-semibold htw:text-muted">{{ total }} {{ total === 1 ? 'plugin' : 'plugins' }}</span>
    <span v-for="chip in chips" :key="chip.key" class="htw:inline-flex htw:h-[22px] htw:shrink-0 htw:items-center htw:gap-[4px] htw:rounded-full htw:bg-accent-soft htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-accent-text">
      {{ chip.label }}
      <button type="button" :aria-label="`Remove ${chip.label} filter`" class="htw:m-0 htw:flex htw:cursor-pointer htw:items-center htw:rounded-[3px] htw:border-0 htw:bg-transparent htw:p-0 htw:text-inherit htw:[font:inherit] htw:focus-visible:outline-2 htw:focus-visible:outline-accent" @click="remove(chip)">
        <BuiltinIcon icon="close" :size="12" />
      </button>
    </span>
    <div class="htw:ml-auto htw:flex htw:items-center htw:gap-[16px]">
      <label v-if="frameworks.length" class="htw:flex htw:cursor-pointer htw:items-center htw:gap-[8px] htw:font-semibold htw:text-body">
        <HstSwitch layout="inline" :aria-label="frameworkTitle" :model-value="matchesProject" @update:model-value="toggle('frameworks', frameworks, $event)" />
        {{ frameworkTitle }}
      </label>
      <HstSelect layout="inline" aria-label="Sort plugins" :model-value="store.sort.value" :options="[{ value: 'relevance', label: 'Relevance' }, { value: 'name', label: 'Name' }, { value: 'updated', label: 'Recently updated' }]" @update:model-value="store.sort.value = $event" />
    </div>
  </div>
</template>
