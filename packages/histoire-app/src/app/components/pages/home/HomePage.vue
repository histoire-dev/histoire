<script setup lang="ts">
import type { HistoireSelectionInput, HistoireTarget } from '@histoire/protocol'
import type { HistoireBuildInfo } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, defineAsyncComponent } from 'vue'
import { histoireConfig } from '../../../util/config.js'
import { useWorkbenchTestsModel } from '../../panes/tests/model.js'

import BrowseSections from './BrowseSections.vue'
import { browseSections, orderedStories } from './catalog.js'
import GuidesList from './GuidesList.vue'
import HomeHeader from './HomeHeader.vue'
import HomeSearch from './HomeSearch.vue'
import { usePageOwnership } from './ownership.js'
import PluginHomeSections from './PluginHomeSections.vue'
import UpdatesList from './UpdatesList.vue'

defineProps<{
  /** Source-owned release/build information; omitted during unavailable Git metadata. */
  buildInfo?: HistoireBuildInfo
}>()
const emit = defineEmits<{
  /** Focus existing Search pane. */
  search: []
  /** Successful catalog selection; SDK facade owns URL navigation. */
  select: [target: HistoireTarget]
  /** Focus shared Tests pane and execute explicit all-tests action. */
  runTests: []
  /** Surface attributable asynchronous errors. */
  error: [error: unknown]
}>()
const session = useHistoireSession()
const ownership = usePageOwnership(session)
const projectTests = useWorkbenchTestsModel()
const snapshot = useHistoireSnapshot()
const dev = computed(() => __HISTOIRE_DEV__ && snapshot.value.source?.mode === 'dev')
const sections = computed(() => browseSections(snapshot.value.catalog))
const guides = computed(() => orderedStories(snapshot.value.catalog).filter(story => story.docsOnly))
const first = computed(() => guides.value[0] ?? orderedStories(snapshot.value.catalog)[0])
const description = computed(() => histoireConfig.theme.description)
const NeedsAttention = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('./NeedsAttention.vue')) : undefined
const DevBrowseStatus = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('./DevBrowseStatus.vue')) : undefined

/** Catalog navigation uses canonical SDK selection, preserving standalone URL ownership. */
async function select(target: HistoireSelectionInput): Promise<void> {
  await ownership.select(target, selected => emit('select', selected), error => emit('error', error))
}

/** Get started selects first actual guide, falling back to first actual story. */
function start(): void {
  if (first.value) void select(first.value.docsOnly ? { storyId: first.value.id, variantId: null } : { storyId: first.value.id })
}
</script>

<template>
  <main class="histoire-home-page htw:h-full htw:overflow-auto htw:bg-home">
    <div class="htw:max-w-[1600px] htw:m-[0_auto] htw:p-[46px_56px] htw:[@media(max-width:_1000px)]:p-[32px] htw:[@media(max-width:_600px)]:p-[24px_16px]">
      <div class="htw:flex htw:items-end htw:justify-between htw:gap-[28px] htw:mb-[26px] htw:[@media(max-width:_1000px)]:flex-wrap">
        <div class="htw:first:max-w-[620px]">
          <HomeHeader :title="histoireConfig.theme.title" :description="description" :build-info="dev ? undefined : buildInfo" />
          <p v-if="dev" class="htw:flex htw:items-center htw:gap-[7px] htw:m-[12px_0_0] htw:text-muted htw:[font:11px_var(--histoire-font-mono,_monospace)]">
            <span class="htw:w-[7px] htw:h-[7px] htw:rounded-full htw:bg-accent" />Dev server<template v-if="buildInfo?.branch">
              · {{ buildInfo.branch }}
            </template><template v-if="buildInfo?.commit">
              · {{ buildInfo.commit.slice(0, 7) }}
            </template>
          </p>
        </div>
        <div class="htw:first:max-w-[620px] htw:flex htw:shrink-0 htw:gap-[10px] htw:[@media(max-width:_600px)]:flex-wrap">
          <HstButton v-if="first" class="htw:flex htw:items-center htw:justify-center htw:gap-[8px] htw:p-[12px_16px] htw:text-text htw:font-bold" color="flat" type="button" @click="start">
            <BuiltinIcon icon="document" :size="16" />Get started
          </HstButton>
          <HstButton v-if="dev && projectTests?.canRun.value" color="primary" type="button" class="htw:flex htw:items-center htw:justify-center htw:gap-[8px] htw:p-[12px_16px] htw:font-bold" :disabled="projectTests.running.value" @click="emit('runTests')">
            <BuiltinIcon icon="play-filled-alt" :size="16" />Run all tests
          </HstButton>
        </div>
      </div>
      <HomeSearch :stories="snapshot.catalog.stories.filter(story => !story.docsOnly).length" :guides="guides.length" @search="emit('search')" />
      <div class="htw:grid htw:[grid-template-columns:minmax(0,_3fr)_minmax(240px,_1fr)] htw:gap-[24px] htw:mt-[24px] htw:[@media(max-width:_1000px)]:[grid-template-columns:minmax(0,_1fr)]">
        <div class="htw:flex htw:flex-col htw:gap-[24px] htw:min-w-0">
          <NeedsAttention v-if="dev && NeedsAttention" @select="select" />
          <BrowseSections :sections="sections" :compact="dev" @select="select">
            <template #status="{ section }">
              <DevBrowseStatus v-if="dev && DevBrowseStatus" :story-ids="section.storyIds" />
            </template>
          </BrowseSections>
          <PluginHomeSections column="primary" />
        </div>
        <aside class="htw:flex htw:flex-col htw:gap-[24px] htw:min-w-0">
          <slot v-if="dev" name="activity" />
          <GuidesList :guides="guides" @select="select" />
          <UpdatesList :changed="buildInfo?.changed" :stories="snapshot.catalog.stories" :dev="dev" @select="select" />
          <PluginHomeSections column="secondary" />
        </aside>
      </div>
      <p v-if="!snapshot.catalog.stories.length" class="htw:text-muted">
        No stories collected.
      </p>
    </div>
  </main>
</template>
