import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { AiThreads } from '../../stores/ai-threads.js'
import type { CanvasStore } from '../../stores/canvas.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { onBeforeUnmount, ref } from 'vue'
import { captureFrameScreenshot } from '../../util/frame-screenshot.js'
import { useCaptureDiscoveryPause } from '../panes/tests/capture.js'

/**
 * Canvas draft screenshot (`draft.screenshot`); owns one correlated request on the existing screenshot executor.
 * @param model Threads store holding the canvas draft.
 * @param frames Registered canvas frames.
 * @param canvas Canvas store with frame preferences.
 */
export function useCommentScreenshot(model: AiThreads, frames: CanvasFrames, canvas: CanvasStore) {
  const requestId = ref('')
  useCaptureDiscoveryPause(requestId)
  let controller: AbortController | undefined
  onBeforeUnmount(() => controller?.abort())
  return { requestId,
    /** Capture the draft's exact currently mounted viewport and preview preferences. */
    async capture() {
      const draft = model.draft.value
      if (!draft?.context?.variantId || !model.available.value || requestId.value) return
      const frame = frames.getFrame(getHistoireTargetKey({ storyId: draft.context.storyId, variantId: draft.context.variantId }))
      if (!frame) return
      controller = new AbortController()
      requestId.value = 'pending'
      try {
        const file = await captureFrameScreenshot(frame, canvas, { signal: controller.signal, onRequest: id => requestId.value = id })
        // A draft replaced meanwhile keeps its own screenshot.
        const current = model.draft.value
        if (current?.id === draft.id) model.draft.value = { ...current, screenshot: file.path }
      }
      catch (error) {
        if (!controller.signal.aborted) model.error.value = error instanceof Error ? error.message : 'Screenshot unavailable. Retry capture.'
      }
      finally { requestId.value = '' }
    },
    /** Detach the draft's screenshot; the stored file stays in the screenshots folder. */
    remove() {
      const draft = model.draft.value
      if (draft) model.draft.value = { ...draft, screenshot: undefined }
    } }
}
