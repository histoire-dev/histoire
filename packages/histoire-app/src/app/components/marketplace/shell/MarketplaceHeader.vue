<script setup lang="ts">
import { BuiltinIcon, HstButton, HstButtonGroup } from '@histoire/controls/vue'
import { ref } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'

defineProps<{
  /** Modal heading identity for its accessible label. */ titleId: string
}>()
const store = useMarketplaceStore()
const search = ref<HTMLInputElement>()
/** Slash and clear actions return keyboard input to search. */
function focusSearch(): void {
  search.value?.focus()
}
/** Clear results without losing the active browse section. */
function clearSearch(): void {
  store.setQuery('')
  focusSearch()
}
defineExpose({ focusSearch })
</script>

<template>
  <header class="htw:box-border htw:flex htw:h-[64px] htw:flex-none htw:items-center htw:gap-[16px] htw:border-0 htw:border-b htw:border-solid htw:border-border htw:bg-surface htw:pr-[12px] htw:pl-[18px] htw:text-[13px]">
    <div class="htw:flex htw:shrink-0 htw:items-center htw:gap-[10px]">
      <span class="htw:grid htw:size-[32px] htw:place-items-center htw:rounded-[9px] htw:bg-accent-soft htw:text-accent" aria-hidden="true"><BuiltinIcon icon="puzzle" :size="18" /></span>
      <h2 :id="titleId" class="htw:m-0 htw:whitespace-nowrap htw:text-[15px] htw:font-extrabold">
        Plugin marketplace
      </h2>
    </div>
    <HstButtonGroup aria-label="Marketplace sections" layout="inline" :model-value="store.view.value" :options="[{ value: 'discover', label: 'Discover' }, { value: 'all', label: 'All plugins' }]" :classes="{ options: 'htw:gap-[2px] htw:rounded-[10px] htw:p-[3px]', option: 'htw:h-[30px] htw:rounded-[8px] htw:px-[12px] htw:py-0 htw:text-[13px] htw:font-bold' }" class="htw:shrink-0" @update:model-value="store.setView" />
    <div class="htw:ml-auto htw:box-border htw:flex htw:h-[36px] htw:w-[340px] htw:min-w-0 htw:items-center htw:gap-[8px] htw:rounded-[9px] htw:border htw:border-solid htw:border-border htw:bg-input htw:pr-[6px] htw:pl-[12px] htw:text-muted htw:focus-within:outline-2 htw:focus-within:outline-accent">
      <BuiltinIcon icon="search" :size="16" class="htw:shrink-0" />
      <input ref="search" type="search" aria-label="Search plugins" placeholder="Search plugins" :value="store.query.value" class="htw:m-0 htw:min-w-0 htw:flex-1 htw:appearance-none htw:border-0 htw:bg-transparent htw:p-0 htw:text-text htw:outline-none htw:[font:inherit] htw:[&::-webkit-search-cancel-button]:appearance-none" @input="store.setQuery(($event.target as HTMLInputElement).value)">
      <HstButton v-if="store.query.value" color="flat" icon-only aria-label="Clear search" class="htw:rounded-[7px] htw:[--histoire-icon-button-size:26px]" @click="clearSearch">
        <BuiltinIcon icon="close" :size="14" />
      </HstButton>
      <kbd v-else class="htw:mr-[4px] htw:rounded-[5px] htw:border htw:border-solid htw:border-border htw:px-[5px] htw:font-mono htw:text-[11px] htw:font-medium" aria-hidden="true">/</kbd>
    </div>
    <span aria-hidden="true" class="htw:h-[24px] htw:w-px htw:shrink-0 htw:bg-border" />
    <HstButton color="flat" aria-label="Close marketplace" class="htw:h-[36px] htw:shrink-0 htw:gap-[8px] htw:rounded-[9px] htw:px-[10px] htw:text-body" @click="store.close">
      <kbd class="htw:rounded-[5px] htw:border htw:border-solid htw:border-border htw:px-[5px] htw:font-mono htw:text-[11px] htw:font-medium htw:text-muted" aria-hidden="true">Esc</kbd>
      <BuiltinIcon icon="close" :size="18" />
    </HstButton>
  </header>
</template>
