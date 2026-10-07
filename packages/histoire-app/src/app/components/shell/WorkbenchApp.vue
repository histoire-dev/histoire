<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { WorkbenchProps } from '../../standalone/workbench-types.js'
import { getHistoireTargetKey, getSandboxRelativeUrl } from '@histoire/protocol'
import { HistoireProvider } from '@histoire/vue'
import { computed, defineAsyncComponent, ref, shallowRef } from 'vue'
import { useWorkbenchBuildInfo } from '../../standalone/build-info.js'
import { useWorkbench } from '../../standalone/workbench.js'
import { customLogos, histoireConfig } from '../../util/config.js'
import CanvasViewport from '../canvas/CanvasViewport.vue'
import MatrixInspector from '../canvas/matrix/MatrixInspector.vue'
import MatrixView from '../canvas/matrix/MatrixView.vue'
import MeasureOverlay from '../canvas/MeasureOverlay.vue'
import CanvasToolbar from '../canvas/toolbar/CanvasToolbar.vue'
import ToolbarButton from '../canvas/toolbar/ToolbarButton.vue'
import StoryInspector from '../inspector/StoryInspector.vue'
import ContextMenu from '../menu/ContextMenu.vue'
import HomePage from '../pages/home/HomePage.vue'
import MarkdownPage from '../pages/markdown/MarkdownPage.vue'
import SettingsPage from '../pages/settings/SettingsPage.vue'
import SearchPanel from '../panes/search/SearchPanel.vue'
import StoriesPanel from '../panes/stories/StoriesPanel.vue'
import ShellLayout from './ShellLayout.vue'

const props = defineProps<WorkbenchProps>()
const emit = defineEmits<{ error: [error: unknown] }>()
const workbench = useWorkbench(props, error => emit('error', error))
const buildInfo = useWorkbenchBuildInfo()
const { snapshot, route, shell, settings, matrix, mcp, dev, search, canvas, shortcuts, highlighted, searchQuery, searchActive, searchMatches, story, markdown, arrange, baseArrange, arrangementOverride, badges } = workbench
const TestsPanel = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../panes/tests/TestsPanel.vue')) : undefined
const McpPanel = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../panes/mcp/McpPanel.vue')) : undefined
const McpActivity = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../panes/mcp/McpActivity.vue')) : undefined
const AgentCursor = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../canvas/AgentCursor.vue')) : undefined
const ScreenshotPopover = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../canvas/toolbar/ScreenshotPopover.vue')) : undefined
const CommentsPanel = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../panes/comments/CommentsPanel.vue')) : undefined
const CommentsCanvasOverlay = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../comments/CommentsCanvasOverlay.vue')) : undefined
const PermissionPrompt = __HISTOIRE_DEV__ ? defineAsyncComponent(() => import('../agents/PermissionPrompt.vue')) : undefined
const commentOverlay = dev?.commentOverlay ?? ref()
const selectedSession = shallowRef<HistoireSession>()
const inspector = computed(() => route.value.name === 'story' && !story.value?.docsOnly)
const isolated = computed(() => {
  const target = snapshot.value.selection
  return target?.variantId ? new URL(getSandboxRelativeUrl({ base: new URL(props.previewBase).pathname, storyId: target.storyId, variantId: target.variantId }), props.previewBase).href : undefined
})
const rows = computed(() => typeof route.value.query.rows === 'string' ? route.value.query.rows : undefined)
const cols = computed(() => typeof route.value.query.cols === 'string' ? route.value.query.cols : undefined)
/** Report rejected route restoration through the existing workbench error boundary. */
function activatePane(pane: 'stories' | 'search' | 'tests' | 'comments' | 'mcp'): void {
  void workbench.activatePane(pane).catch(error => emit('error', error))
}

/** Fit the exact mounted frame; Matrix has multiple cells for one variant. */
function fitVariant(target: HistoireTarget): void {
  if (arrange.value === 'matrix' || target.variantId === null) return
  const current = canvas.value
  const frame = current?.registry.getFrame(getHistoireTargetKey(target))
  if (frame) current.canvas.zoomToSelection(frame.fitBounds ?? frame.rect)
}

/** Bind inspector to exact selected ready frame for every navigation path. */
function setSelectedSession(session: HistoireSession | undefined): void {
  props.runtime.bind(session)
  selectedSession.value = session
}
</script>

<template>
  <ShellLayout :home-href="navigation.router.resolve({ name: 'home' }).href" :home-active="route.name === 'home'" :logo-href="histoireConfig.theme.logoHref" :logos="customLogos" settings-available :settings-active="route.name === 'settings'" :hide-theme="histoireConfig.theme.hideColorSchemeSwitch" :show-inspector="inspector" :badges="badges" :data-density="settings.state.density" @home="workbench.navigate('home')" @pane="activatePane" @settings="workbench.navigate('settings')" @error="emit('error', $event)">
    <template #stories>
      <StoriesPanel :folders="folders" @select="shell.closePanelAfterSelection" @fit="fitVariant" @error="emit('error', $event)" />
    </template>
    <template #search>
      <SearchPanel ref="search" :commands="commands" @select="workbench.searchSelected" @isolated="workbench.openIsolated" @highlight="highlighted = $event" @query="searchQuery = $event" @next-match="workbench.nextMatch" @close="workbench.closeSearch" @error="emit('error', $event)" />
    </template>
    <template #tests>
      <TestsPanel v-if="TestsPanel" @select="workbench.testsSelected" @error="emit('error', $event)" />
    </template>
    <template #comments>
      <CommentsPanel v-if="CommentsPanel && dev" :model="dev.comments" :agents="dev.commentAgents.value" @select="dev.selectComment" @setup-agent="dev.setupAgents" />
    </template>
    <template #mcp>
      <McpPanel v-if="McpPanel" />
    </template>
    <template #main>
      <SettingsPage v-if="route.name === 'settings'" :section="typeof route.params.section === 'string' ? route.params.section : undefined" :build-info="buildInfo" @section="workbench.navigate('settings', $event)" />
      <MarkdownPage v-else-if="route.name === 'story' && markdown" :anchor="route.hash" @select="shell.closePanelAfterSelection" @error="emit('error', $event)" />
      <CanvasViewport v-else-if="route.name === 'story'" ref="canvas" :preview-base="previewBase" :frame-budget="histoireConfig.ui?.frameBudget ?? 6" :arrange="arrange" :base-arrange="baseArrange" :arrangement-override="arrangementOverride" :highlighted-targets="highlighted" :search-active="searchActive" :comment-mode="dev?.commentMode.value" :ui-hidden="shell.uiHidden.value" :inspector-width="!shell.uiHidden.value && shell.inspectorOpen.value && !shell.narrow.value ? shell.inspectorWidth.value + 24 : 0" @selected-session="setSelectedSession" @frame-pointer="dev?.pickComment($event)" @error="emit('error', $event)">
        <template #toolbar>
          <CanvasToolbar :arrange="arrange" :matrix-available="matrix.available.value" :match-count="searchMatches.count.value" :match-position="searchMatches.position.value" @previous-match="workbench.previousMatch" @next-match="workbench.nextMatch" @arrange="workbench.setArrange" @edit-presets="workbench.navigate('settings', 'viewports')">
            <template #screenshot="slot">
              <ScreenshotPopover v-if="ScreenshotPopover && snapshot.selection?.variantId" :story-id="snapshot.selection.storyId" :variant-id="snapshot.selection.variantId" :open="slot.open" :trigger="dev?.screenshotTrigger.value" @update:open="slot.setOpen" />
            </template>
            <template #comment>
              <ToolbarButton v-if="dev" label="Comment for AI" icon="add-comment" :disabled="!dev.comments.available.value" :pressed="dev.commentMode.value" @click="dev.startComment()" />
            </template>
            <template #inspector>
              <ToolbarButton v-if="!shell.inspectorOpen.value" label="Show inspector" icon="side-panel-open" @click="shell.toggleInspector" />
            </template>
            <template #ui>
              <ToolbarButton label="Hide UI" icon="screen-off" :shortcut="shortcuts.hint('global.toggle-ui')" @click="workbench.toggleUi" />
            </template>
          </CanvasToolbar>
        </template>
        <template #matrix="slot">
          <MatrixView :rows="rows" :cols="cols" :preview-base="previewBase" :frame-budget="histoireConfig.ui?.frameBudget ?? 6" :size="slot.size" :content-insets="slot.contentInsets" :ui-hidden="shell.uiHidden.value" @axes="workbench.setAxes" @error="emit('error', $event)" />
        </template>
        <template #overlays>
          <CommentsCanvasOverlay v-if="CommentsCanvasOverlay && dev" ref="commentOverlay" :model="dev.comments" :agents="dev.commentAgents.value" @composed="dev.commentMode.value = false" @setup-agent="dev.setupAgents" />
          <MeasureOverlay /><AgentCursor v-if="AgentCursor && mcp" />
        </template>
      </CanvasViewport>
      <HomePage v-else :build-info="buildInfo" @search="workbench.openSearch" @select="shell.closePanelAfterSelection" @run-tests="workbench.runAll" @error="emit('error', $event)">
        <template #activity>
          <McpActivity v-if="McpActivity" @open="workbench.showPane('mcp')" />
        </template>
      </HomePage>
    </template>
    <template #inspector>
      <HistoireProvider v-if="selectedSession" class="histoire-selected-inspector" :session="selectedSession" @error="emit('error', $event)">
        <StoryInspector :active-tab="typeof route.query.tab === 'string' ? route.query.tab : ''" :docs-anchor="route.hash" :isolated-href="isolated" :project-test-session="props.session" @panel="workbench.panel" @close="shell.toggleInspector" @error="emit('error', $event)" />
      </HistoireProvider>
      <StoryInspector v-else :active-tab="typeof route.query.tab === 'string' ? route.query.tab : ''" :docs-anchor="route.hash" :isolated-href="isolated" :project-test-session="props.session" @panel="workbench.panel" @close="shell.toggleInspector" @error="emit('error', $event)">
        <template v-if="arrange === 'matrix'" #matrix-props>
          <MatrixInspector />
        </template>
      </StoryInspector>
    </template>
    <template #overlays>
      <ContextMenu /><PermissionPrompt v-if="PermissionPrompt" />
    </template>
  </ShellLayout>
</template>
