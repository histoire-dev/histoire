<script setup lang="ts">
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../composables/canvas-settings.js'
import { useMcpStore } from '../../stores/mcp.js'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'
import { getMcpCursor } from './agent-cursor.js'

const mcp = useMcpStore()
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const snapshot = useHistoireSnapshot()
const layer = ref<HTMLElement>()
const geometryVersion = ref(0)
const frame = computed(() => canvas.selectedFrame ? frames.getFrame(canvas.selectedFrame) : null)
const bounds = computed(() => {
  void geometryVersion.value
  const rect = layer.value?.getBoundingClientRect()
  return rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null
})
const position = computed(() => bounds.value ? getMcpCursor({ activity: mcp, snapshot: snapshot.value, canvas, frames, bounds: bounds.value }) : null)
let resize: ResizeObserver | undefined
let host: Window | null = null

/** DOM projection runs after canvas transforms commit, including pan and responsive geometry. */
function refreshGeometry(): void {
  geometryVersion.value++
}
watch(() => [
  canvas.panOffset.x,
  canvas.panOffset.y,
  canvas.effectiveZoom,
  canvas.inspectorWidth,
  canvas.viewport.width,
  canvas.viewport.height,
  frame.value?.rect.x,
  frame.value?.rect.y,
  frame.value?.rect.width,
  frame.value?.rect.height,
  frame.value?.iframe,
  frame.value?.documentId,
], refreshGeometry, { flush: 'post' })
onMounted(() => {
  host = layer.value?.ownerDocument.defaultView ?? null
  resize = new ResizeObserver(refreshGeometry)
  if (layer.value) resize.observe(layer.value)
  host?.addEventListener('resize', refreshGeometry)
  host?.addEventListener('scroll', refreshGeometry, true)
  refreshGeometry()
})
onBeforeUnmount(() => {
  resize?.disconnect()
  host?.removeEventListener('resize', refreshGeometry)
  host?.removeEventListener('scroll', refreshGeometry, true)
})
</script>

<template>
  <div ref="layer" class="histoire-agent-cursor-layer" :style="{ right: `${canvas.inspectorWidth}px` }" aria-hidden="true">
    <div v-if="position && mcp.current" class="histoire-agent-cursor" :style="{ left: `${position.x}px`, top: `${position.y}px` }">
      <WorkbenchIcon name="cursor-1" :size="20" />
      <span>{{ mcp.clientName(mcp.current.clientId) }} · {{ mcp.current.tool }}</span>
    </div>
  </div>
</template>

<style scoped>
.histoire-agent-cursor-layer { position: absolute; inset: 0; z-index: 10; overflow: hidden; pointer-events: none; }
.histoire-agent-cursor { position: absolute; display: grid; justify-items: start; color: var(--histoire-agent); }
.histoire-agent-cursor > svg { filter: drop-shadow(0 1px 1px rgb(0 0 0 / 25%)); }
.histoire-agent-cursor > span { margin: 0 0 0 12px; max-width: 220px; padding: 3px 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 6px; color: #fff; background: var(--histoire-agent); font-size: 11px; font-weight: 600; }
</style>
