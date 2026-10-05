import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { WorkbenchComments } from '../../stores/comments.js'
import { getControlStateKeys } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { ELEMENT_PICK_REQUEST, ELEMENT_PICK_RESULT } from '@histoire/shared'
import { onBeforeUnmount, onMounted } from 'vue'

/** Exact pointer identity emitted by CanvasViewport. */
export interface CommentFramePoint {
  /** Registry's injective frame tuple. */
  frameKey: string
  /** Collected story identity. */
  storyId: string
  /** Collected variant identity. */
  variantId: string
  /** Unscaled preview CSS point. */
  point: { x: number, y: number }
}

/** Finite element pick is attributed to one iframe document and frame target. */
export function useCommentPick(model: WorkbenchComments, frames: CanvasFrames, composed: () => void) {
  let pending: { point: CommentFramePoint, documentId: string, requestId: string } | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  /** Retire old requests before another click or component teardown. */
  function clear() {
    pending = undefined
    clearTimeout(timeout)
  }
  /** Safe JSON context excludes derived control definitions and live runtime objects. */
  function finish(selector?: string) {
    const owner = pending
    const frame = owner && frames.getFrame(owner.point.frameKey)
    if (!owner || !frame?.iframe || frame.documentId !== owner.documentId) return clear()
    const current = frame.session?.getSnapshot()
    const target = { storyId: owner.point.storyId, variantId: owner.point.variantId }
    if (current?.status !== 'ready' || current.stale || current.runtime.status !== 'ready') return clear()
    let props: Record<string, unknown> | undefined
    const state = current.state?.value as Record<string, unknown> | undefined
    if (state && getHistoireTargetKey(current.state!.target) === getHistoireTargetKey(target)) {
      try {
        const values = { ...Object.fromEntries(getControlStateKeys(state).map(key => [key, state[key]])), ...(state._hPropState ? { componentProps: state._hPropState } : {}) }
        const json = JSON.stringify(values)
        if (new TextEncoder().encode(json).length <= 16 * 1024) props = JSON.parse(json)
      }
      catch { /* Cyclic/opaque state leaves a usable coordinate comment. */ }
    }
    if (model.compose({ target, anchor: { ...owner.point.point, selector }, props })) composed()
    clear()
  }
  /** Reply cannot claim a replacement runtime, another frame, or previous click. */
  function receive(event: MessageEvent) {
    const owner = pending
    const frame = owner && frames.getFrame(owner.point.frameKey)
    const data = event.data
    if (!owner || !frame?.iframe || event.origin !== window.location.origin || event.source !== frame.iframe.contentWindow || data?.__histoire !== true || data.type !== ELEMENT_PICK_RESULT || data.requestId !== owner.requestId || data.documentId !== owner.documentId || data.storyId !== owner.point.storyId || data.variantId !== owner.point.variantId) return
    if (data.result === null) finish()
    else if (typeof data.result?.selector === 'string' && data.result.selector.length <= 4096) finish(data.result.selector)
  }
  onMounted(() => window.addEventListener('message', receive))
  onBeforeUnmount(() => {
    clear()
    window.removeEventListener('message', receive)
  })
  return {
    /** One click produces one composer; older runtimes fall back to coordinates. */
    pick(point: CommentFramePoint) {
      clear()
      if (!model.available.value) return
      const frame = frames.getFrame(point.frameKey)
      if (!frame?.documentId || !frame.iframe || frame.storyId !== point.storyId || frame.variantId !== point.variantId || !Number.isFinite(point.point.x) || !Number.isFinite(point.point.y) || point.point.x < 0 || point.point.y < 0 || point.point.x > frame.rect.width || point.point.y > frame.rect.height) return
      pending = { point, documentId: frame.documentId, requestId: `comment-${crypto.randomUUID()}` }
      const sent = frames.postToFrame(point.frameKey, { type: ELEMENT_PICK_REQUEST, ...point.point, requestId: pending.requestId, storyId: point.storyId, variantId: point.variantId })
      if (!sent) finish()
      else timeout = setTimeout(() => finish(), 700)
    },
  }
}
