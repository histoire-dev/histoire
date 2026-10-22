import type { UiScreenshotFile } from '@histoire/shared'
import type { CanvasFrames } from '../composables/canvas-settings.js'
import type { CanvasStore } from '../stores/canvas.js'
import { getBackgroundCapture } from './background.js'
import { onUiDisconnect, onUiEvent, sendUiEvent } from './ui-channel.js'

/** One mounted canvas frame. */
type CanvasFrame = NonNullable<ReturnType<CanvasFrames['getFrame']>>

/** Longest wait for the screenshot service before giving up. */
const CAPTURE_TIMEOUT = 25_000

/**
 * Captures one mounted frame exactly as displayed (viewport size and background) through the
 * shared screenshot service, resolving with the stored file.
 * @param frame Mounted frame to capture.
 * @param canvas Canvas owning the frame's background choice.
 * @param options Abort signal and the request id prefix.
 * @param options.signal Cancels the request.
 * @param options.onRequest Receives the request id once sent, e.g. to pause test discovery.
 */
export function captureFrameScreenshot(frame: CanvasFrame, canvas: CanvasStore, options: { signal?: AbortSignal, onRequest?: (requestId: string) => void } = {}): Promise<UiScreenshotFile> {
  const settings = frame.session?.getSnapshot().settings
  if (!frame.iframe || !settings) return Promise.reject(new Error('Screenshot unavailable. Retry capture.'))
  const requestId = `capture-${crypto.randomUUID()}`
  const background = canvas.frameBackgrounds[frame.id] ?? settings
  return new Promise<UiScreenshotFile>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const listeners: (() => void)[] = []
    /** Detach every listener; cancel the server request when it is still running. */
    function finish(cancel = false): void {
      if (cancel) sendUiEvent('histoire:ui:screenshot-cancel', { requestId })
      clearTimeout(timer)
      for (const dispose of listeners.splice(0)) dispose()
      options.signal?.removeEventListener('abort', aborted)
    }
    /** Caller gave up. */
    function aborted(): void {
      finish(true)
      reject(new Error('Screenshot cancelled'))
    }
    listeners.push(onUiEvent('histoire:ui:screenshot-result', (result) => {
      if (result.requestId !== requestId) return
      finish()
      if ('error' in result) return reject(new Error(result.error.message))
      const file = result.files.find(file => file.storyId === frame.storyId && file.variantId === frame.variantId)
      if (file) resolve(file)
      else reject(new Error('Screenshot unavailable. Retry capture.'))
    }), onUiDisconnect(() => {
      finish()
      reject(new Error('Screenshot service disconnected.'))
    }))
    timer = setTimeout(() => {
      finish(true)
      reject(new Error('Screenshot timed out. Retry capture.'))
    }, CAPTURE_TIMEOUT)
    options.signal?.addEventListener('abort', aborted, { once: true })
    try {
      const accepted = sendUiEvent('histoire:ui:screenshot', { requestId, targets: [{ storyId: frame.storyId, variantId: frame.variantId }], viewport: { width: Math.round(frame.rect.width), height: Math.round(frame.rect.height) }, scale: 1, format: 'png', background: getBackgroundCapture(background) })
      if (!accepted) throw new Error('unavailable')
      options.onRequest?.(requestId)
    }
    catch {
      finish()
      reject(new Error('Screenshot unavailable. Retry capture.'))
    }
  })
}
