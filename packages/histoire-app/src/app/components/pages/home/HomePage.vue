<script setup lang="ts">
import type { HistoireSelectionInput, HistoireTarget } from '@histoire/protocol'
import type { HistoireBuildInfo } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, defineAsyncComponent } from 'vue'
import { histoireConfig } from '../../../util/config.js'
import { useWorkbenchTestsModel } from '../../panes/tests/model.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import BrowseSections from './BrowseSections.vue'
import { browseSections, orderedStories } from './catalog.js'
import GuidesList from './GuidesList.vue'
import HomeHeader from './HomeHeader.vue'
import HomeSearch from './HomeSearch.vue'
import { usePageOwnership } from './ownership.js'
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
  <main class="histoire-home-page">
    <div class="histoire-home-content">
      <div class="histoire-home-heading">
        <div>
          <HomeHeader :title="histoireConfig.theme.title" :description="description" :build-info="dev ? undefined : buildInfo" />
          <p v-if="dev" class="histoire-home-dev-line">
            <span />Dev server<template v-if="buildInfo?.branch">
              · {{ buildInfo.branch }}
            </template><template v-if="buildInfo?.commit">
              · {{ buildInfo.commit.slice(0, 7) }}
            </template>
          </p>
        </div>
        <div class="histoire-home-actions">
          <HstButton v-if="first" color="flat" type="button" :class="{ primary: !dev }" @click="start">
            <WorkbenchIcon name="document" />Get started
          </HstButton>
          <HstButton v-if="dev && projectTests?.canRun.value" color="primary" type="button" class="primary" :disabled="projectTests.running.value" @click="emit('runTests')">
            <WorkbenchIcon name="play-filled-alt" />Run all tests
          </HstButton>
        </div>
      </div>
      <HomeSearch :stories="snapshot.catalog.stories.filter(story => !story.docsOnly).length" :guides="guides.length" @search="emit('search')" />
      <div class="histoire-home-columns">
        <div class="histoire-home-primary">
          <NeedsAttention v-if="dev && NeedsAttention" @select="select" />
          <BrowseSections :sections="sections" :compact="dev" @select="select">
            <template #status="{ section }">
              <DevBrowseStatus v-if="dev && DevBrowseStatus" :story-ids="section.storyIds" />
            </template>
          </BrowseSections>
        </div>
        <aside class="histoire-home-secondary">
          <slot v-if="dev" name="activity" />
          <GuidesList :guides="guides" @select="select" />
          <UpdatesList :changed="buildInfo?.changed" :stories="snapshot.catalog.stories" :dev="dev" @select="select" />
        </aside>
      </div>
      <p v-if="!snapshot.catalog.stories.length" class="histoire-home-empty">
        No stories collected.
      </p>
    </div>
  </main>
</template>

<style scoped>
.histoire-home-page { height: 100%; overflow: auto; background: var(--histoire-home, var(--histoire-canvas, var(--histoire-background))); }
.histoire-home-content { max-width: 1600px; margin: 0 auto; padding: 46px 56px; }
.histoire-home-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; margin-bottom: 26px; }
.histoire-home-heading > div:first-child { max-width: 620px; }
.histoire-home-actions { display: flex; flex-shrink: 0; gap: 10px; }
.histoire-home-actions button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; color: var(--histoire-text); font-weight: 700; }
.histoire-home-dev-line { display: flex; align-items: center; gap: 7px; margin: 12px 0 0; color: var(--histoire-muted); font: 11px var(--histoire-font-mono, monospace); }
.histoire-home-dev-line > span { width: 7px; height: 7px; border-radius: 50%; background: var(--histoire-accent); }
.histoire-home-columns { display: grid; grid-template-columns: minmax(0, 3fr) minmax(240px, 1fr); gap: 24px; margin-top: 24px; }
.histoire-home-primary, .histoire-home-secondary { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.histoire-home-empty { color: var(--histoire-muted); }
@media (max-width: 1000px) { .histoire-home-content { padding: 32px; } .histoire-home-heading { flex-wrap: wrap; } .histoire-home-columns { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .histoire-home-content { padding: 24px 16px; } .histoire-home-actions { flex-wrap: wrap; } }
</style>
