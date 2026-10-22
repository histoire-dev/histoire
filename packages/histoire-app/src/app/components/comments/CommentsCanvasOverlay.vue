<script setup lang="ts">
import type { UiAiThreadAnchor, UiCommentAgent } from '@histoire/shared'
import type { AiThreads } from '../../stores/ai-threads.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { isPinnedThread } from '@histoire/shared'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../composables/canvas-settings.js'
import { useCommentScreenshot } from './capture.js'
import CommentComposer from './CommentComposer.vue'
import CommentPin from './CommentPin.vue'
import CommentThread from './CommentThread.vue'
import { useDismissOnOutsideClick } from './dismiss-outside.js'
import { useFrameGeometryTick } from './frame-geometry.js'
import { useCommentPick } from './pick.js'
import { pinNumbers } from './presentation.js'

/** Canvas placement of a pinned thread or draft. */
interface PinTarget {
  /** Exact variant owning the pin. */
  context?: { storyId: string, variantId?: string }
  /** Logical frame point. */
  anchor?: UiAiThreadAnchor
}

const props = defineProps<{
  /** Shell-owned threads model. */
  model: AiThreads
  /** Safe ACP display state. */
  agents: readonly UiCommentAgent[]
  /** Comment tool is active; pins only show in this mode. */
  active?: boolean
}>()
const emit = defineEmits<{
  /** Open AI settings from unavailable-agent composer. */
  setupAgent: []
}>()
const context = useHistoireContext()
const snapshot = shallowRef(context.session.getSnapshot())
useHistoireResource(context.session.subscribe(value => snapshot.value = value))
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const tick = ref(0)
const viewport = ref({ width: 1024, height: 768 })
const draftOwner = shallowRef<{ id: string, documentId: string } | null>(null)
const capture = useCommentScreenshot(props.model, frames, canvas)
const picker = useCommentPick(props.model, frames)
defineExpose({ pick: picker.pick })

/** Last projected point per frame and anchor, reused while that frame's document reloads. */
const lastPoints = new Map<string, { point: { x: number, y: number }, camera: string }>()
/**
 * Pins follow mounted iframe geometry after canvas DOM transforms are applied.
 * Geometry only needs the iframe box, so a story reload (agent edits, HMR) keeps
 * pins and the open card in place instead of unmounting them until the new document is ready.
 */
function position(pin: PinTarget) {
  void tick.value
  if (!isPinnedThread(pin)) return null
  const { context, anchor } = pin
  const id = getHistoireTargetKey(context)
  const frame = frames.getFrame(id)
  if (!frame || frame.storyId !== context.storyId || frame.variantId !== context.variantId) return null
  const key = `${id}:${anchor.x}:${anchor.y}`
  // Cached points are only valid for the camera they were projected with.
  const camera = `${canvas.panOffset.x}:${canvas.panOffset.y}:${canvas.effectiveZoom}`
  if (!frame.iframe) {
    const last = lastPoints.get(key)
    return last?.camera === camera ? last.point : null
  }
  const point = frames.frameToClient(id, anchor)
  const bounds = frame.iframe.closest('.histoire-canvas-viewport')?.getBoundingClientRect()
  if (!point || !bounds || point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return null
  lastPoints.set(key, { point, camera })
  return point
}
/** Pins of pinned threads whose variant frame is mounted, numbered like the pane list. */
const pins = computed(() => {
  if (!props.active) return []
  const numbers = pinNumbers(props.model.threads.value)
  return props.model.pinned.value.flatMap((thread) => {
    // Archived pins stay hidden unless shown by the pane toggle or their thread is open.
    // Pins follow the list: active threads, or only archived ones while the archive is shown.
    if ((thread.status === 'resolved') !== props.model.showArchived.value && props.model.activeId.value !== thread.id) return []
    const point = position(thread)
    return point ? [{ thread, number: numbers.get(thread.id) ?? 0, point }] : []
  })
})
/** Open pinned thread; free-form threads never show a canvas card. */
const selected = computed(() => {
  const thread = props.model.selectedThread.value
  return thread && isPinnedThread(thread) ? thread : undefined
})
const active = computed(() => props.model.draft.value ?? selected.value)
/** Unsaved anchors stay owned by the picked document, never its replacement. */
const draftAnchor = computed(() => {
  const draft = props.model.draft.value
  if (!draft || !isPinnedThread(draft) || draftOwner.value?.id !== draft.id) return null
  const frame = frames.getFrame(getHistoireTargetKey(draft.context))
  return frame?.documentId === draftOwner.value.documentId ? position(draft) : null
})
const anchor = computed(() => props.model.draft.value ? draftAnchor.value : active.value ? position(active.value) : null)
const cardStyle = computed(() => anchor.value
  ? {
      left: `${Math.max(12, Math.min(anchor.value.x + 24, viewport.value.width - 372))}px`,
      top: `${Math.max(12, Math.min(anchor.value.y + 12, viewport.value.height - 430))}px`,
    }
  : undefined)

/** Collected labels are presentation only; identities stay exact tuples. */
function title(pin: PinTarget): string {
  const context = pin.context
  if (!context) return ''
  const story = snapshot.value.catalog.stories.find(story => story.id === context.storyId)
  return `${story?.title ?? context.storyId} › ${story?.variants.find(variant => variant.id === context.variantId)?.title ?? context.variantId}`
}
/** Browser resize changes overlay projection, never saved logical coordinates. */
function resize() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  tick.value++
}
useFrameGeometryTick(canvas, frames, tick)
// Outside clicks minimize threads only; unsaved composer text is never discarded.
useDismissOnOutsideClick(() => {
  if (!props.model.draft.value && selected.value) props.model.dismiss()
})
// Capture once per composer. Screenshot/context updates retain this owner;
// dismissal and save acknowledgment remove the temporary anchor automatically.
watch(() => props.model.draft.value?.id, () => {
  const draft = props.model.draft.value
  const frame = draft && isPinnedThread(draft) && frames.getFrame(getHistoireTargetKey(draft.context))
  draftOwner.value = draft && frame?.documentId ? { id: draft.id, documentId: frame.documentId } : null
}, { immediate: true, flush: 'sync' })
onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('scroll', resize, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  window.removeEventListener('scroll', resize, true)
})
</script>

<template>
  <Teleport :to="context.overlay.value ?? context.root.value ?? 'body'">
    <div v-for="pin in pins" :key="pin.thread.id" class="canvas-comment-pin" :style="{ left: `${pin.point.x}px`, top: `${pin.point.y}px` }">
      <CommentPin :number="pin.number" :active="model.activeId.value === pin.thread.id" :draft="pin.thread.status === 'draft'" :resolved="pin.thread.status === 'resolved'" @select="model.toggle(pin.thread.id)" />
    </div>
    <div v-if="draftAnchor" class="canvas-comment-pin" :style="{ left: `${draftAnchor.x}px`, top: `${draftAnchor.y}px` }">
      <CommentPin active temporary />
    </div>
    <div v-if="anchor && cardStyle" class="canvas-comment-overlay" :style="cardStyle">
      <div class="canvas-comment-card">
        <CommentComposer v-if="model.draft.value" :draft="model.draft.value" :title="title(model.draft.value)" :agents="agents" :capturing="Boolean(capture.requestId.value) || model.pending.value" @send="model.sendDraft" @attach="capture.capture" @close="model.dismiss" @setup-agent="emit('setupAgent')" @remove-screenshot="capture.remove" />
        <CommentThread v-else-if="selected" :thread="selected" :title="title(selected)" :agents="agents" :disabled="!model.available.value" @reply="model.reply" @resolve="model.archive(selected!.id, $event)" @remove="model.remove(selected!.id)" @close="model.dismiss" />
      </div>
      <Transition name="comment-error" appear>
        <p v-if="model.error.value" class="comment-error" role="alert">
          {{ model.error.value }}
        </p>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* Bubble tail (bottom-left corner) points at the anchor, matching the comments pane badge. */
.canvas-comment-pin { position: fixed; z-index: 28; transform: translateY(-100%); pointer-events: auto; }
.canvas-comment-overlay { position: fixed; z-index: 32; pointer-events: auto; }
/* The scroll container owns the shadow so its overflow cannot clip it. */
.canvas-comment-card { max-height: calc(100vh - 24px); overflow: auto; border-radius: var(--histoire-radius-panel); box-shadow: var(--histoire-shadow-panel); }
.canvas-comment-card :deep(.comment-card), .canvas-comment-card :deep(.comment-thread) { box-shadow: none; }
.comment-error { max-width: 340px; margin: 8px 0 0; padding: 9px 12px; border-radius: var(--histoire-radius-control); background: var(--histoire-danger-soft); color: var(--histoire-danger-text); font-size: 12px; }
.comment-error-enter-active { transition: opacity 180ms ease-out, transform 180ms cubic-bezier(0.16, 1, 0.3, 1); }
.comment-error-leave-active { transition: opacity 140ms ease-in, transform 140ms ease-in; pointer-events: none; }
.comment-error-enter-from, .comment-error-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .comment-error-enter-active, .comment-error-leave-active { transition: none; }
  .comment-error-enter-from, .comment-error-leave-to { transform: none; }
}
</style>
