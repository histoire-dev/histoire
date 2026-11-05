<script setup lang="ts">
import type { MarketplaceDetailTab } from '../../../stores/marketplace.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, nextTick, ref, useId } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'
import ChangelogTab from './ChangelogTab.vue'
import DetailHeader from './DetailHeader.vue'
import MetaList from './MetaList.vue'
import OptionsTab from './OptionsTab.vue'
import OverviewTab from './OverviewTab.vue'
import { usePluginDetail } from './use-plugin-detail.js'
import VersionsTab from './VersionsTab.vue'

const store = useMarketplaceStore()
const { detail, loading, error, notFound, load } = usePluginDetail()
/** Fixed order defines automatic tab activation and wraparound navigation. */
const tabs = ['Overview', 'Options', 'Changelog', 'Versions'] as const
const active = computed({
  /** Resolve intent before metadata arrives, so loading cannot reset selected tab. */
  get: () => tabs.find(tab => tab.toLowerCase() === store.detailTab.value)!,
  /** Tab clicks and keyboard navigation share the same history-aware intent. */
  set: (tab: (typeof tabs)[number]) => { store.detailTab.value = tab.toLowerCase() as MarketplaceDetailTab },
})
const prefix = `marketplace-detail-${useId()}`
const tablist = ref<HTMLElement>()

/** Arrow/Home/End select and focus one tab, leaving a single tab stop. */
async function navigate(event: KeyboardEvent): Promise<void> {
  const current = tabs.indexOf(active.value)
  const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
  if (next < 0) return
  event.preventDefault()
  active.value = tabs[next]
  await nextTick()
  tablist.value?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
}
</script>

<template>
  <section v-if="store.open.value && store.view.value === 'detail'" aria-label="Plugin details" class="htw:flex htw:min-h-0 htw:flex-1 htw:flex-col htw:overflow-auto">
    <WorkbenchLoadingState v-if="loading" title="Loading plugin" immediate />
    <WorkbenchErrorState v-else-if="error" title="Couldn't load plugin">
      {{ error }}
      <template #actions>
        <HstButton color="flat" aria-label="Retry" @click="load">
          Retry
        </HstButton>
      </template>
    </WorkbenchErrorState>
    <WorkbenchEmptyState v-else-if="notFound" icon="search" title="Plugin not found" />
    <div v-else-if="detail" class="htw:box-border htw:mx-auto htw:w-full htw:max-w-[1144px] htw:px-[32px] htw:py-[24px] htw:text-[13px] htw:leading-[1.45]">
      <DetailHeader :plugin="detail" />
      <div ref="tablist" role="tablist" aria-label="Plugin details" class="htw:my-[22px] htw:flex htw:flex-wrap htw:gap-[22px] htw:border-0 htw:border-b htw:border-solid htw:border-border" @keydown="navigate">
        <button v-for="tab in tabs" :id="`${prefix}-tab-${tab}`" :key="tab" type="button" role="tab" :aria-selected="active === tab" :aria-controls="`${prefix}-panel-${tab}`" :tabindex="active === tab ? 0 : -1" class="htw:relative htw:m-0 htw:h-[40px] htw:cursor-pointer htw:border-0 htw:bg-transparent htw:px-[2px] htw:py-0 htw:[font:inherit] htw:focus-visible:outline-2 htw:focus-visible:outline-accent" :class="active === tab ? 'htw:text-text' : 'htw:text-muted'" @click="active = tab">
          <span class="htw:text-[13px] htw:font-bold">{{ tab }}</span>
          <span v-if="active === tab" aria-hidden="true" class="htw:absolute htw:inset-x-0 htw:bottom-0 htw:h-[2px] htw:bg-accent" />
        </button>
      </div>
      <div class="htw:flex htw:flex-wrap htw:items-start htw:gap-[28px]">
        <div class="htw:min-w-0 htw:flex-[999_1_520px]">
          <div v-for="tab in tabs" :id="`${prefix}-panel-${tab}`" :key="tab" role="tabpanel" :hidden="active !== tab" :aria-labelledby="`${prefix}-tab-${tab}`" tabindex="0">
            <template v-if="active === tab">
              <OverviewTab v-if="tab === 'Overview'" :plugin="detail" />
              <template v-else-if="tab === 'Options'">
                <OptionsTab :options="detail.manifest.config.options ?? []" />
                <HstButton v-if="store.installRequest.value?.kind === 'options' && store.installRequest.value.id === detail.id" color="primary" class="htw:mt-[18px]" @click="store.startInstall(store.installRequest.value)">
                  Edit options
                </HstButton>
              </template>
              <ChangelogTab v-else-if="tab === 'Changelog'" :plugin="detail" />
              <VersionsTab v-else :plugin="detail" />
            </template>
          </div>
        </div>
        <MetaList :plugin="detail" />
      </div>
    </div>
    <WorkbenchEmptyState v-else icon="plug" title="Select a plugin" tone="neutral" />
  </section>
</template>
