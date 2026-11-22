<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'

const props = defineProps<{
  /** Section rendering the page; another section's page never shows while this one loads. */ view: 'discover' | 'all'
}>()
const store = useMarketplaceStore()
const ready = computed(() => !!store.page.value && store.pageView.value === props.view)
</script>

<template>
  <WorkbenchLoadingState v-if="store.loading.value && !ready" title="Loading plugins" />
  <WorkbenchErrorState v-if="store.error.value" title="Couldn't load plugins">
    {{ store.error.value }}
    <template #actions>
      <HstButton color="flat" aria-label="Retry loading plugins" @click="store.loadCatalog">
        Retry
      </HstButton>
    </template>
  </WorkbenchErrorState>
  <p v-if="ready && ['stale', 'error'].includes(store.page.value.sources.community)" role="status" class="htw:m-0 htw:rounded-control htw:bg-chip htw:p-[12px] htw:text-[12px] htw:text-muted">
    Community plugins unavailable<span v-if="store.page.value.sources.community === 'stale'"> · Showing saved results</span>
  </p>
  <p v-if="ready && store.page.value.sources.official !== 'ok'" role="status" class="htw:m-0 htw:rounded-control htw:bg-chip htw:p-[12px] htw:text-[12px] htw:text-muted">
    {{ store.page.value.sources.official === 'stale' ? 'Showing saved official plugins' : 'Showing bundled official plugins' }}
  </p>
  <slot v-if="ready" />
</template>
