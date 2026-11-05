<script setup lang="ts">
import { HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import CatalogState from './CatalogState.vue'
import FacetPanel from './FacetPanel.vue'
import NoResults from './NoResults.vue'
import PluginCard from './PluginCard.vue'
import ResultsBar from './ResultsBar.vue'
import { useCatalogQuery } from './use-catalog-query.js'

const { store, entries, selectedCollection, collections, cursor, loadingMore, moreError, selectCollection, clearFilters, loadMore } = useCatalogQuery()
</script>

<template>
  <div class="htw:flex htw:min-h-0 htw:flex-1 htw:flex-col">
    <CatalogState view="all">
      <div v-if="store.page.value" class="htw:flex htw:min-h-0 htw:flex-1" :aria-busy="store.loading.value">
        <FacetPanel :page="store.page.value" />
        <main class="htw:flex htw:min-w-0 htw:flex-1 htw:flex-col htw:gap-[20px] htw:overflow-auto htw:px-[32px] htw:py-[24px]">
          <div v-if="selectedCollection" class="htw:flex htw:items-center htw:justify-between htw:gap-[12px]">
            <h2 class="htw:m-0 htw:text-[15px] htw:font-extrabold">
              {{ selectedCollection.title }}
            </h2><HstButton color="flat" @click="clearFilters">
              All plugins
            </HstButton>
          </div>
          <ResultsBar :total="store.page.value.total" :frameworks="store.page.value.project.frameworks" :collection-title="selectedCollection?.title" />
          <div v-if="entries.length" class="htw:shrink-0 htw:overflow-hidden htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface">
            <PluginCard v-for="entry in entries" :key="entry.id" :plugin="entry" />
          </div>
          <NoResults v-else :collections="collections" @clear="clearFilters" @collection="selectCollection" />
          <WorkbenchErrorState v-if="moreError" title="Couldn't load plugins">
            {{ moreError }}<template #actions>
              <HstButton color="flat" @click="loadMore">
                Retry
              </HstButton>
            </template>
          </WorkbenchErrorState>
          <HstButton v-if="cursor" color="flat" :disabled="loadingMore || store.loading.value || !!store.error.value" aria-label="Load more plugins" class="htw:self-center" @click="loadMore">
            <HstPulsatingDisc v-if="loadingMore" :size="12" />Load more
          </HstButton>
        </main>
      </div>
    </CatalogState>
  </div>
</template>
