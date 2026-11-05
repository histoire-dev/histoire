<script setup lang="ts">
import type { CatalogPage } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import PluginTile from '../shell/PluginTile.vue'

defineProps<{
  /** Named curated membership returned by the catalog. */ collection: NonNullable<CatalogPage['discover']>['collections'][number]
}>()
defineEmits<{
  /** Open every known member in the All plugins grid. */ select: []
}>()
const store = useMarketplaceStore()
</script>

<template>
  <section :aria-label="collection.title" class="htw:flex htw:flex-col htw:gap-[12px]">
    <div class="htw:flex htw:items-baseline htw:justify-between htw:gap-[12px]">
      <h2 class="htw:m-0 htw:text-[15px] htw:font-extrabold">
        {{ collection.title }}
      </h2>
      <HstButton color="flat" tone="accent" :aria-label="`See all ${collection.title}`" class="htw:h-auto htw:p-0 htw:font-bold htw:text-accent-link" @click="$emit('select')">
        See all
      </HstButton>
    </div>
    <div class="htw:grid htw:grid-cols-1 htw:gap-[12px] htw:md:grid-cols-2 htw:xl:grid-cols-4">
      <button v-for="entry in collection.entries.slice(0, 4)" :key="entry.id" type="button" :aria-label="`Details for ${entry.displayName}`" class="htw:m-0 htw:flex htw:min-w-0 htw:cursor-pointer htw:items-center htw:gap-[10px] htw:rounded-[14px] htw:border-0 htw:bg-surface htw:p-[14px] htw:text-left htw:text-inherit htw:inset-ring htw:inset-ring-border htw:[font:inherit] htw:hover:bg-chip htw:focus-visible:outline-2 htw:focus-visible:outline-accent" @click="store.showPlugin(entry.id)">
        <PluginTile :plugin="entry" :size="34" class="htw:text-[12px]" />
        <span class="htw:min-w-0">
          <span class="htw:block htw:text-[13px] htw:font-extrabold">{{ entry.displayName }}</span>
          <span class="htw:block htw:truncate htw:text-[12px] htw:text-muted">{{ entry.official ? 'Official' : entry.publisher }}{{ entry.installed ? ' · installed' : '' }}</span>
        </span>
      </button>
    </div>
  </section>
</template>
