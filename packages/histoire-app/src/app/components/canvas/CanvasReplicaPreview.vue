<script setup lang="ts">
import type { StoryFrameStatus } from './frames/acquire-story-frame.js'
import { useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasFrameState, useCanvasStore } from '../../composables/canvas-settings.js'
import { useMatrixStore } from '../../stores/matrix.js'
import { useCanvasStartupCoordinator } from './frame-startup-coordinator.js'
import { acquireStoryFrame } from './frames/acquire-story-frame.js'
import { useFrameSnapshot } from './snapshots/useFrameSnapshot.js'
import { useCanvasContentSizing } from './useCanvasContentSizing.js'

const props = defineProps<{
  /** Stable canvas frame identifier. */
  frameId: string
  /** Suppress document input during direct frame resizing. */
  interactive?: boolean
  /** Exact collected target. */
  storyId: string
  variantId: string
  /** Configured standalone source base, independent of route. */
  previewBase: string
  /** Native Single dimensions, already resolved for orientation. */
  viewport?: { width: number, height: number }
  /** Story-declared variant size; sizes the document without changing how its frame scrolls or starts. */
  declaredSize?: { width: number, height: number }
  /** Matrix cell prop projection; never writes into canonical session. */
  propsOverride?: Record<string, unknown>
}>()
const emit = defineEmits<{ status: [status: 'loading' | 'ready' | 'error', error?: unknown], snapshot: [shown: boolean] }>()
const canonical = useHistoireSession()
const context = useHistoireContext()
const snapshot = useHistoireSnapshot()
const store = useCanvasStore()
const container = ref<HTMLElement>()
// Mirrors frame readiness; content sizing must exist before the frame watches its settings.
const ready = ref(false)
// eslint-disable-next-line ts/no-use-before-define -- prop acknowledgement is awaited only after startup.
const contentSizing = useCanvasContentSizing({ canvas: store, canonical, snapshot, container, ready, target: () => props, wait: () => frame.wait() })
// Last rendering of this cell, shown until its live frame is ready.
const frameSnapshot = useFrameSnapshot({ canvas: store, snapshot, target: () => props, previewBase: () => props.previewBase, container, ready, content: contentSizing })
watch(() => !!frameSnapshot.document.value && !ready.value, shown => emit('snapshot', shown), { immediate: true })
const frame = acquireStoryFrame({
  canonical,
  frames: useCanvasFrames(),
  frameState: useCanvasFrameState(),
  matrix: useMatrixStore(),
  startup: useCanvasStartupCoordinator(),
  frameId: () => props.frameId,
  target: () => ({ storyId: props.storyId, variantId: props.variantId }),
  previewBase: () => props.previewBase,
  viewport: () => props.viewport,
  propsOverride: () => props.propsOverride,
  container: () => container.value,
  settings,
  arrangement: () => store.arrangement,
  root: () => context.root.value,
  onStatus: status,
})

/** Apply canonical settings and frame-local presentation overrides. */
function settings() {
  const value = snapshot.value.settings
  const background = store.frameBackgrounds[props.frameId]
  const viewport = props.declaredSize ?? contentSizing.size.value ?? props.viewport
  return { ...value, ...(background ?? {}), ...(viewport ? { responsiveWidth: viewport.width, responsiveHeight: viewport.height, rotate: false } : {}) }
}

/** Measure restored content before announcing readiness to frame chrome. */
function status(value: StoryFrameStatus, error?: unknown): void {
  ready.value = value === 'ready'
  if (value === 'ready') contentSizing.refresh()
  if (value === 'error') emit('status', value, error)
  else emit('status', value)
}

onMounted(() => void frame.start())
onBeforeUnmount(frame.release)
defineExpose({ retry: frame.start, getSource: frame.getSource })
</script>

<template>
  <div class="htw:relative htw:w-full htw:h-full">
    <div ref="container" class="histoire-canvas-replica htw:data-[interactive=false]:[&_iframe]:pointer-events-none htw:group-data-[panning=true]/viewport:[&_iframe]:pointer-events-none htw:w-full htw:h-full htw:[color-scheme:normal]" :data-interactive="interactive ?? true" :aria-busy="!ready" :inert="!ready ? true : undefined" />
    <!-- Script-less copy of the last rendering; same origin only so fonts and assets load. -->
    <iframe v-if="frameSnapshot.document.value && !ready" class="htw:absolute htw:inset-0 htw:w-full htw:h-full htw:border-0 htw:[color-scheme:normal] htw:pointer-events-none" :srcdoc="frameSnapshot.document.value" sandbox="allow-same-origin" tabindex="-1" aria-hidden="true" />
  </div>
</template>
