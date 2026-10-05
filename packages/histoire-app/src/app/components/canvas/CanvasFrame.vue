<script setup lang="ts">
import type { HistoireCatalogVariant } from '@histoire/sdk'
import type { CanvasFrameLayout } from './frame-layout.js'
import { HstButton } from '@histoire/controls/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../composables/canvas-settings.js'
import { useContextMenu } from '../../composables/context-menu.js'
import { useWorkbenchTestsModel } from '../panes/tests/model.js'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'
import CanvasReplicaPreview from './CanvasReplicaPreview.vue'
import { isFrameMenuShortcut, openFrameMenu } from './frame-menu.js'

const props = defineProps<{
  /** Complete canvas target and logical bounds. */
  frame: CanvasFrameLayout
  /** Collected variant display metadata. */
  variant: HistoireCatalogVariant
  /** Live-budget admission; placeholders preserve target and layout. */
  live: boolean
  /** Primary selection owns canonical SDK runtime. */
  selected: boolean
  /** Absolute configured source base. */
  previewBase: string
  /** Preview logical dimensions before canvas scaling. */
  width: number
  height: number
  /** Known collection failure keeps existing preview visible but inactive. */
  stale?: boolean
  /** List places readable name beside preview, matching workbench reference. */
  arrange?: 'grid' | 'list'
  /** Exact search match highlight. */
  highlighted?: boolean
  /** Active-query nonmatches dim without disabling native frame interaction. */
  dimmed?: boolean
}>()
const emit = defineEmits<{ select: [variantId: string], contextmenu: [event: MouseEvent | KeyboardEvent, frame: CanvasFrameLayout] }>()
const canvas = useCanvasStore()
const registry = useCanvasFrames()
const menu = useContextMenu()
const tests = useWorkbenchTestsModel()
const test = computed(() => tests?.rows.value.find(row => row.target.storyId === props.frame.storyId && row.target.variantId === props.frame.variantId))
const testIcon = computed(() => test.value?.running ? 'in-progress' : test.value?.failed || test.value?.error ? 'error-filled' : test.value?.stale ? 'warning-alt-filled' : test.value?.summary ? 'checkmark-filled' : props.variant.hasTests ? 'subtract' : null)
const replica = ref<{ retry: () => Promise<void> }>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref<unknown>()
const position = computed(() => ({ left: `${props.frame.x * canvas.effectiveZoom + canvas.panOffset.x}px`, top: `${props.frame.y * canvas.effectiveZoom + canvas.panOffset.y}px`, width: `${props.width * canvas.effectiveZoom + (props.arrange === 'list' ? 144 : 0)}px` }))
const previewStyle = computed(() => ({ width: `${props.width}px`, height: `${props.height}px`, transform: `scale(${canvas.effectiveZoom})` }))
const background = computed(() => {
  const color = canvas.frameBackgrounds[props.frame.id]?.backgroundColor ?? canvas.frameBackground
  return color === 'transparent' ? '#fff' : color
})
let unregister = () => {}

/** Register placeholder geometry before passive document readiness. */
function register() {
  unregister()
  unregister = registry.registerFrame({ id: props.frame.id, storyId: props.frame.storyId, variantId: props.frame.variantId, rect: { x: props.frame.x + (props.arrange === 'list' ? 144 / canvas.effectiveZoom : 0), y: props.frame.y + (props.arrange === 'list' ? 0 : 28 / canvas.effectiveZoom), width: props.width, height: props.height } })
}
onMounted(register)
watch(() => [props.frame, props.width, props.height, canvas.effectiveZoom], () => {
  const existing = registry.getFrame(props.frame.id)
  if (existing) existing.rect = { x: props.frame.x + (props.arrange === 'list' ? 144 / canvas.effectiveZoom : 0), y: props.frame.y + (props.arrange === 'list' ? 0 : 28 / canvas.effectiveZoom), width: props.width, height: props.height }
})
watch(() => props.stale, (stale) => {
  const frame = registry.getFrame(props.frame.id)
  if (stale && frame) {
    frame.documentId = null
    frame.session = undefined
  }
})
onBeforeUnmount(() => unregister())

/** Frame failures keep retry local; passive errors never fail canonical controls. */
function updateStatus(value: typeof status.value, detail?: unknown) {
  status.value = value
  error.value = detail
}

/** Native menu key opens same chrome menu as pointer context menu. */
function onKeyDown(event: KeyboardEvent) {
  if (isFrameMenuShortcut(event)) {
    event.preventDefault()
    openMenu(event)
  }
}

/** Captured menu target does not mutate URL variant selection. */
function openMenu(event: MouseEvent | KeyboardEvent) {
  if (props.stale) return
  openFrameMenu(menu, event, { storyId: props.frame.storyId, variantId: props.frame.variantId, frameKey: props.frame.id })
  emit('contextmenu', event, props.frame)
}
</script>

<template>
  <section class="histoire-canvas-frame" :class="{ 'is-selected': selected, 'is-stale': stale, 'is-list': arrange === 'list', 'is-highlighted': highlighted, 'is-dimmed': dimmed }" :style="position" :data-frame-id="frame.id" @contextmenu.prevent="openMenu">
    <HstButton color="flat" class="histoire-frame-label" :aria-pressed="selected" @click="emit('select', variant.id)" @keydown="onKeyDown">
      <span>{{ variant.title }}</span><WorkbenchIcon v-if="status === 'error'" name="error-filled" :size="12" class="is-error" /><WorkbenchIcon v-else-if="testIcon" :name="testIcon" :size="12" :class="{ 'is-error': test?.failed || test?.error }" />
    </HstButton>
    <div class="histoire-frame-body" data-test-id="responsive-preview-bg" :style="{ height: `${height * canvas.effectiveZoom}px`, background }" @click="!selected && emit('select', variant.id)">
      <div class="histoire-frame-content" :style="previewStyle">
        <CanvasReplicaPreview v-if="live && !selected" ref="replica" :frame-id="frame.id" :story-id="frame.storyId" :variant-id="frame.variantId" :preview-base="previewBase" @status="updateStatus" />
      </div>
      <div v-if="!live" class="histoire-frame-placeholder">
        {{ variant.title }}
      </div>
      <div v-else-if="!selected && status === 'loading'" class="histoire-frame-placeholder">
        Loading preview…
      </div>
      <div v-else-if="!selected && status === 'error'" class="histoire-frame-error" role="alert">
        <span>{{ error instanceof Error ? error.message : 'Preview unavailable' }}</span><HstButton color="flat" @click.stop="replica?.retry()">
          Retry
        </HstButton>
      </div>
      <div v-if="!selected && live" class="histoire-frame-select" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.histoire-canvas-frame { position: absolute; min-width: 0; }
.is-dimmed { opacity: .35; }
.histoire-frame-label { width: 100%; height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 0 8px; color: var(--histoire-muted); text-align: left; }
.histoire-frame-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-selected .histoire-frame-label { color: var(--histoire-accent); font-weight: 700; }
.histoire-frame-label svg { color: var(--histoire-accent); } .histoire-frame-label svg.is-error { color: var(--histoire-danger); }
.histoire-frame-body { position: relative; width: 100%; overflow: hidden; border: 1px solid var(--histoire-border); border-radius: 7px; background: white; }
.is-list { display: flex; align-items: center; gap: 0; } .is-list .histoire-frame-label { width: 144px; flex: none; justify-content: flex-start; padding: 0 12px 0 0; } .is-list .histoire-frame-body { flex: 1; min-width: 0; }
.is-highlighted .histoire-frame-label { color: var(--histoire-accent); } .is-highlighted .histoire-frame-body { border-color: var(--histoire-accent); }
.is-selected .histoire-frame-body { outline: 2px solid var(--histoire-accent); outline-offset: -1px; }
.histoire-frame-content { transform-origin: top left; }
.histoire-frame-select { position: absolute; inset: 0; cursor: pointer; }
.histoire-frame-placeholder, .histoire-frame-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; color: var(--histoire-muted); background: var(--histoire-field); font-size: 12px; text-align: center; }
.histoire-frame-error { z-index: 2; color: var(--histoire-danger); background: var(--histoire-danger-soft); }
.histoire-frame-error button { padding: 4px 10px; color: inherit; }
.is-stale .histoire-frame-content { opacity: .4; pointer-events: none; }
</style>
