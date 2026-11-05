<script setup lang="ts">
import { computed } from 'vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import CatalogState from './CatalogState.vue'
import CollectionRow from './CollectionRow.vue'
import DiscoverHero from './DiscoverHero.vue'
import { frameworkLabel } from './labels.js'
import PluginCard from './PluginCard.vue'
import { useCatalogQuery } from './use-catalog-query.js'

const { store, selectCollection } = useCatalogQuery()
/** Recommendations can be empty even when every catalog plugin is installed. */
const hasDiscovery = computed(() => {
  const discovery = store.page.value?.discover
  return !!(discovery?.hero || discovery?.picks.length || discovery?.collections.length)
})
</script>

<template>
  <div class="htw:min-h-0 htw:flex-1 htw:overflow-auto htw:px-[32px] htw:py-[24px]">
    <div class="htw:mx-auto htw:flex htw:max-w-[1100px] htw:flex-col htw:gap-[26px]">
      <CatalogState view="discover">
        <template v-if="store.page.value">
          <section aria-label="For this project" class="htw:flex htw:flex-col htw:gap-[12px]">
            <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-[8px]">
              <h2 class="htw:m-0 htw:mr-[6px] htw:text-[15px] htw:font-extrabold">
                For this project
              </h2>
              <span v-for="signal in [...new Set([...store.page.value.project.frameworks, ...store.page.value.project.signals])]" :key="signal" class="htw:inline-flex htw:h-[22px] htw:items-center htw:rounded-full htw:bg-surface htw:px-[9px] htw:text-[11px] htw:font-semibold htw:text-body htw:inset-ring htw:inset-ring-border">{{ frameworkLabel(signal) }}</span>
            </div>
            <div v-if="store.page.value.discover?.hero || store.page.value.discover?.picks.length" class="htw:grid htw:grid-cols-1 htw:gap-[14px]" :class="store.page.value.discover?.hero && store.page.value.discover?.picks.length ? 'htw:xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''">
              <DiscoverHero v-if="store.page.value.discover?.hero" :plugin="store.page.value.discover.hero" />
              <div v-if="store.page.value.discover?.picks.length" class="htw:flex htw:flex-col htw:gap-[14px]">
                <PluginCard v-for="entry in store.page.value.discover.picks" :key="entry.id" :plugin="entry" :reason="entry.reason" layout="pick" />
              </div>
            </div>
          </section>
          <CollectionRow v-for="collection in store.page.value.discover?.collections ?? []" :key="collection.id" :collection="collection" @select="selectCollection(collection)" />
          <WorkbenchEmptyState v-if="!hasDiscovery && (store.page.value.discover || !store.page.value.entries.length)" icon="puzzle" title="No recommendations" tone="neutral" />
          <!-- Static catalogs have no project signals or curated payload; keep their official rows discoverable. -->
          <section v-if="!store.page.value.discover && store.page.value.entries.length" aria-label="Official plugins" class="htw:overflow-hidden htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface">
            <PluginCard v-for="entry in store.page.value.entries" :key="entry.id" :plugin="entry" />
          </section>
        </template>
      </CatalogState>
    </div>
  </div>
</template>
