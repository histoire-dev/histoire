import type { CanvasFrames } from '../../composables/canvas-settings.js'
import type { CanvasStore } from '../../stores/canvas.js'
import type { WorkbenchComments } from '../../stores/comments.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { onBeforeUnmount, ref } from 'vue'
import { onUiDisconnect, onUiEvent, sendUiEvent } from '../../util/ui-channel.js'
import { useCaptureDiscoveryPause } from '../panes/tests/capture.js'

/** Draft attachment owns one correlated request on the existing screenshot executor. */
export function useCommentScreenshot(model: WorkbenchComments, frames: CanvasFrames, canvas: CanvasStore) {
  const requestId = ref('')
  useCaptureDiscoveryPause(requestId)
  let owner = ''
  let timeout: ReturnType<typeof setTimeout> | undefined
  /** Retire request before observing an unrelated capture completion. */
  function clear(cancel = false) {
    if (cancel && requestId.value) sendUiEvent('histoire:ui:screenshot-cancel', { requestId: requestId.value })
    requestId.value = ''
    owner = ''
    clearTimeout(timeout)
  }
  const off = onUiEvent('histoire:ui:screenshot-result', (result) => {
    if (result.requestId !== requestId.value) return
    const draft = model.draft.value
    if ('error' in result) {
      model.error.value = result.error.message
    }
    else if (draft?.id === owner) {
      const file = result.files.find(file => file.storyId === draft.storyId && file.variantId === draft.variantId)
      if (file) model.draft.value = { ...draft, screenshot: file.path }
      else model.error.value = 'Screenshot unavailable. Retry capture.'
    }
    clear()
  })
  const disconnected = onUiDisconnect(() => {
    clear()
    model.error.value = 'Screenshot service disconnected.'
  })
  onBeforeUnmount(() => {
    clear(true)
    off()
    disconnected()
  })
  return { requestId,
    /** Capture the draft's exact currently mounted viewport and preview preferences. */
    capture() {
      const draft = model.draft.value
      if (!draft || !model.available.value || requestId.value) return
      const frame = frames.getFrame(getHistoireTargetKey(draft))
      const settings = frame?.session?.getSnapshot().settings
      if (!frame?.iframe || !settings) return
      const background = canvas.frameBackgrounds[frame.id] ?? settings
      requestId.value = `comment-${crypto.randomUUID()}`
      owner = draft.id
      try {
        const accepted = sendUiEvent('histoire:ui:screenshot', { requestId: requestId.value, targets: [{ storyId: draft.storyId, variantId: draft.variantId }], viewport: { width: Math.round(frame.rect.width), height: Math.round(frame.rect.height) }, scale: 1, format: 'png', background: background.checkerboard ? '$checkerboard' : background.backgroundColor })
        if (!accepted) throw new Error('Screenshot unavailable')
        timeout = setTimeout(() => {
          clear(true)
          model.error.value = 'Screenshot timed out. Retry capture.'
        }, 25_000)
      }
      catch {
        clear()
        model.error.value = 'Screenshot unavailable. Retry capture.'
      }
    } }
}
