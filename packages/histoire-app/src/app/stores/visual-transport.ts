import type { UiVisualReply, UiVisualRequest } from '@histoire/shared'
import { onUiDisconnect, onUiEvent, onUiReconnect, sendUiEvent } from '../util/ui-channel.js'

/** Commands excluding browser-generated correlation field. */
export type VisualCommand = UiVisualRequest extends infer T ? T extends { requestId: string } ? Omit<T, 'requestId'> : never : never

/** Private request matching keeps another tab's results from settling local work. */
export function createVisualTransport(progress: (reply: UiVisualReply) => void, disconnected: () => void, reconnected: () => void) {
  const pending = new Map<string, { resolve: (reply: UiVisualReply) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>, streamed?: (reply: UiVisualReply) => void }>()
  const stop = onUiEvent('histoire:ui:visual-result', (reply) => {
    const request = pending.get(reply.requestId)
    if (!request) {
      progress(reply)
      return
    }
    clearTimeout(request.timer)
    if (!reply.error && reply.done === false && request.streamed) {
      request.streamed(reply)
      request.timer = timeout(reply.requestId, request.reject)
      return
    }
    pending.delete(reply.requestId)
    if (reply.error) {
      request.reject(new Error(reply.error))
    }
    else {
      request.resolve(reply)
    }
  })
  /** Progress resets inactivity deadline without settling another request. */
  function timeout(requestId: string, reject: (error: Error) => void) {
    return setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Visual operation timed out'))
    }, 30_000)
  }
  /** Reject held external work when connection or provider ownership ends. */
  function clear() {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('Visual service disconnected'))
    }
    pending.clear()
  }
  const stopDisconnect = onUiDisconnect(() => {
    clear()
    disconnected()
  })
  const stopReconnect = onUiReconnect(reconnected)
  return {
    /** Generate unguessable browser-local correlation. */
    identity: () => crypto.randomUUID(),
    /** Submit long-running capture without a fixed request timeout. */
    send(command: VisualCommand, requestId: string) {
      if (!sendUiEvent('histoire:ui:visual', { ...command, requestId })) {
        throw new Error('Visual service unavailable')
      }
    },
    /** Await bounded metadata or persistence operation. */
    request(command: VisualCommand, streamed?: (reply: UiVisualReply) => void): Promise<UiVisualReply> {
      const requestId = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const timer = timeout(requestId, reject)
        pending.set(requestId, { resolve, reject, timer, ...(command.action === 'approve-review' ? { streamed } : {}) })
        try {
          if (!sendUiEvent('histoire:ui:visual', { ...command, requestId })) {
            throw new Error('Visual service unavailable')
          }
        }
        catch (error) {
          clearTimeout(timer)
          pending.delete(requestId)
          reject(error)
        }
      })
    },
    /** Dispose subscriptions before stale replies can arrive. */
    close() {
      stop()
      stopDisconnect()
      stopReconnect()
      clear()
    },
  }
}
