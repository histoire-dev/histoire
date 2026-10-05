<script setup lang="ts">
import type { ShellPane } from '../../stores/shell.js'
import { HstButton } from '@histoire/controls/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { onMounted, useId, watch } from 'vue'
import { useShell } from '../../composables/shell.js'
import AppRail from './AppRail.vue'
import InspectorFrame from './InspectorFrame.vue'
import { watchDismissedPanelFocus } from './panel-focus.js'
import SidePanelHost from './SidePanelHost.vue'
import '../../style/density.css'

const props = defineProps<{
  /** Home href resolved by explicit standalone navigation adapter. */
  homeHref: string
  /** Active Home route, independent of side-panel selection and visibility. */
  homeActive?: boolean
  /** Optional project logo hyperlink. */
  logoHref?: string
  /** Existing resolved project logo assets. */
  logos?: { square?: string, light?: string, dark?: string }
  /** Settings navigation is enabled only after route registration. */
  settingsAvailable?: boolean
  /** Active settings route, used by its rail affordance. */
  settingsActive?: boolean
  /** Existing theme visibility option. */
  hideTheme?: boolean
  /** Story routes decide whether inspector is applicable. */
  showInspector?: boolean
  /** Caller-provided dev status counts. */
  badges?: Partial<Record<ShellPane, number>>
}>()
const emit = defineEmits<{ home: [], settings: [], error: [error: unknown] }>()
const shell = useShell()
const context = useHistoireContext()
const panelId = `histoire-side-panel-${useId()}`
const inspectorId = `histoire-inspector-${useId()}`
const stopSize = watch(() => context.size.value.width, shell.setNarrow, { immediate: true })
const stopInspector = watch(() => !!props.showInspector, shell.setInspectorAvailable, { immediate: true })
const stopPanelFocus = watchDismissedPanelFocus({
  getRoot: () => context.root.value,
  isOpen: () => shell.panelOpen.value && shell.pane.value !== 'home',
  getDestination: () => context.root.value?.querySelector<HTMLElement>(`[data-shell-pane="${shell.pane.value}"]`) ?? null,
})
let selection = JSON.stringify(context.session.getSnapshot().selection)
const stopSelection = context.session.subscribe((value) => {
  // Search owns dismissal after its Docs route/anchor finishes. Other panes
  // can dismiss on selection; unrelated publications never close a panel.
  const key = JSON.stringify(value.selection)
  if (selection !== key) {
    selection = key
    if (value.selection && shell.pane.value !== 'search') shell.closePanelAfterSelection()
  }
})
onMounted(() => {
  try {
    const storage = context.root.value?.ownerDocument.defaultView?.localStorage
    if (storage) shell.restore(storage)
  }
  catch { /* Restricted browser storage leaves usable in-memory preferences. */ }
})
useHistoireResource(() => {
  stopSize()
  stopInspector()
  stopPanelFocus()
  stopSelection()
})
</script>

<template>
  <div class="histoire-shell-layout" :data-panel-open="shell.panelOpen.value && shell.pane.value !== 'home'" :style="{ '--histoire-panel-width': `${shell.panelWidth.value}px` }">
    <AppRail :panel-id="panelId" :home-href="homeHref" :home-active="homeActive" :logo-href="logoHref" :logos="logos" :settings-available="settingsAvailable" :settings-active="settingsActive" :hide-theme="hideTheme" :badges="badges" @home="emit('home')" @settings="emit('settings')" @error="emit('error', $event)" />
    <HstButton v-if="shell.narrow.value && shell.panelOpen.value && shell.pane.value !== 'home'" color="flat" class="histoire-shell-backdrop" type="button" aria-label="Close side panel" @click="shell.togglePanel" />
    <SidePanelHost v-if="shell.panelOpen.value && shell.pane.value !== 'home'" :id="panelId" :pane="shell.pane.value">
      <slot :name="shell.pane.value" />
    </SidePanelHost>
    <main class="histoire-shell-main">
      <slot name="main">
        <slot />
      </slot>
      <InspectorFrame v-if="showInspector && shell.inspectorOpen.value && $slots.inspector" :id="inspectorId" @close="shell.toggleInspector">
        <template v-if="$slots['inspector-header']" #header>
          <slot name="inspector-header" />
        </template>
        <slot name="inspector" />
      </InspectorFrame>
      <slot name="overlays" />
    </main>
  </div>
</template>

<style scoped>
.histoire-shell-layout { display: grid; grid-template-columns: 56px minmax(0, 1fr); width: 100%; min-width: 0; min-height: 0; height: 100%; color: var(--histoire-text); background: var(--histoire-canvas); font-family: var(--histoire-font-sans, Manrope, system-ui, sans-serif); font-size: 13px; }
.histoire-shell-layout[data-panel-open="true"] { grid-template-columns: 56px var(--histoire-panel-width, 280px) minmax(0, 1fr); }
.histoire-shell-main { display: flex; flex-direction: column; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.histoire-shell-backdrop { position: absolute; inset: 0 0 56px; z-index: 70; padding: 0; }
@container (max-width: 640px) {
  .histoire-shell-layout, .histoire-shell-layout[data-panel-open="true"] { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 56px; }
  .histoire-shell-main { grid-row: 1; }
  .histoire-shell-layout :deep(.histoire-app-rail) { grid-row: 2; z-index: 90; }
}
</style>
