<script setup lang="ts">
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import type { WorkbenchComments } from '../../stores/comments.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../composables/canvas-settings.js'
import { useCommentScreenshot } from './capture.js'
import CommentComposer from './CommentComposer.vue'
import CommentPin from './CommentPin.vue'
import CommentThread from './CommentThread.vue'
import { useCommentPick } from './pick.js'

const props = defineProps<{
  /** Shell-owned persisted annotation model. */
  model: WorkbenchComments
  /** Safe ACP display state. */
  agents: readonly UiCommentAgent[]
}>()
const emit = defineEmits<{
  /** Exit pointer comment mode after its composer is placed. */
  composed: []
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
const picker = useCommentPick(props.model, frames, () => emit('composed'))
defineExpose({ pick: picker.pick })

/** Pins follow mounted iframe geometry after canvas DOM transforms are applied. */
function position(comment: Pick<UiComment, 'storyId' | 'variantId' | 'anchor'>) {
  void tick.value
  const id = getHistoireTargetKey(comment)
  const frame = frames.getFrame(id)
  if (!frame?.iframe || !frame.documentId || frame.storyId !== comment.storyId || frame.variantId !== comment.variantId) return null
  const point = frames.frameToClient(id, comment.anchor)
  const bounds = frame.iframe.closest('.histoire-canvas-viewport')?.getBoundingClientRect()
  if (!point || !bounds || point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return null
  return point
}
const pins = computed(() => props.model.comments.value.flatMap((comment, index) => {
  if (comment.status === 'resolved' && !props.model.showResolved.value) return []
  const point = position(comment)
  return point ? [{ comment, number: index + 1, point }] : []
}))
const active = computed(() => props.model.draft.value ?? props.model.selected.value)
/** Unsaved anchors stay owned by the picked document, never its replacement. */
const draftAnchor = computed(() => {
  const draft = props.model.draft.value
  if (!draft || draftOwner.value?.id !== draft.id) return null
  const frame = frames.getFrame(getHistoireTargetKey(draft))
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
function title(comment: Pick<UiComment, 'storyId' | 'variantId'>): string {
  const story = snapshot.value.catalog.stories.find(story => story.id === comment.storyId)
  return `${story?.title ?? comment.storyId} › ${story?.variants.find(variant => variant.id === comment.variantId)?.title ?? comment.variantId}`
}
/** Browser resize changes overlay projection, never saved logical coordinates. */
function resize() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  tick.value++
}
watch(() => [canvas.panOffset.x, canvas.panOffset.y, canvas.effectiveZoom, ...[...frames.frames.values()].flatMap(frame => [frame.iframe, frame.documentId])], () => tick.value++, { flush: 'post' })
// Capture once per composer. Screenshot/context updates retain this owner;
// dismissal and save acknowledgment remove the temporary anchor automatically.
watch(() => props.model.draft.value?.id, () => {
  const draft = props.model.draft.value
  const frame = draft && frames.getFrame(getHistoireTargetKey(draft))
  draftOwner.value = draft && frame?.documentId ? { id: draft.id, documentId: frame.documentId } : null
}, { immediate: true, flush: 'sync' })
onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => window.removeEventListener('resize', resize))
</script>

<template>
  <Teleport :to="context.overlay.value ?? context.root.value ?? 'body'">
    <div v-for="pin in pins" :key="pin.comment.id" class="canvas-comment-pin" :style="{ left: `${pin.point.x}px`, top: `${pin.point.y}px` }">
      <CommentPin :number="pin.number" :active="model.activeId.value === pin.comment.id" :draft="pin.comment.status === 'draft'" @select="model.open(pin.comment.id)" />
    </div>
    <div v-if="draftAnchor" class="canvas-comment-pin" :style="{ left: `${draftAnchor.x}px`, top: `${draftAnchor.y}px` }">
      <CommentPin active temporary />
    </div>
    <div v-if="anchor && cardStyle" class="canvas-comment-card" :style="cardStyle">
      <CommentComposer v-if="model.draft.value" :draft="model.draft.value" :title="title(model.draft.value)" :agents="agents" :capturing="Boolean(capture.requestId.value) || model.pending.value" @save="model.save" @send="model.sendDraft" @attach="capture.capture" @close="model.dismiss" @setup-agent="emit('setupAgent')" />
      <CommentThread v-else-if="model.selected.value" :comment="model.selected.value" :title="title(model.selected.value)" :agents="agents" :disabled="!model.available.value" @reply="(id, body) => model.reply(id, body)" @resolve="model.resolve(model.selected.value!.id, $event)" @remove="model.remove(model.selected.value!.id)" @close="model.dismiss" />
      <p v-if="model.error.value" class="comment-error" role="alert">
        {{ model.error.value }}
      </p>
    </div>
  </Teleport>
</template>

<style scoped>
.canvas-comment-pin { position: fixed; z-index: 28; transform: translate(-50%, -50%); pointer-events: auto; }
.canvas-comment-card { position: fixed; z-index: 32; pointer-events: auto; max-height: calc(100vh - 24px); overflow: auto; }
.comment-error { max-width: 340px; margin: 8px 0 0; padding: 9px 12px; border-radius: var(--histoire-radius-control); background: var(--histoire-danger-soft); color: var(--histoire-danger-text); font-size: 12px; }
</style>
