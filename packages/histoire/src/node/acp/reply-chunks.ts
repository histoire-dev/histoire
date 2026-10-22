import type { AcpPromptRequest, AcpUpdate } from './types.js'

/**
 * Splits one reply delta into UI-channel-sized chunks for the prompt observer and manager listeners.
 * Safe consumers cannot break ACP notification dispatch.
 * @param agentId Agent producing the reply.
 * @param request Active prompt request.
 * @param text Redacted reply delta.
 * @param emit Manager event dispatcher.
 */
export function emitReplyChunks(agentId: string, request: AcpPromptRequest, text: string, emit: (event: AcpUpdate) => void): void {
  // Worst-case JSON escaping takes six bytes per character; small chunks stay
  // within the UI channel's 64 KB limit without changing secret filtering.
  for (let index = 0; index < text.length; index += 8000) {
    const chunk = text.slice(index, index + 8000)
    try {
      request.onUpdate?.(chunk)
    }
    catch { /* UI/comment observers do not own the agent transport. */ }
    emit({ type: 'reply', value: { agentId, threadId: request.threadId, text: chunk } })
  }
}
