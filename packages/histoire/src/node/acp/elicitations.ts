import type { CreateElicitationRequest, CreateElicitationResponse } from '@agentclientprotocol/sdk'
import type { UiAgentElicitation, UiAgentElicitationField, UiAgentElicitationReply, UiAgentElicitationResolved } from '@histoire/shared'
import { randomUUID } from 'node:crypto'
import { validateElicitationContent } from '@histoire/shared'
import { projectElicitation } from './elicitation-schema.js'

/** Abandoned or refused-to-show requests. */
const cancelled: CreateElicitationResponse = { action: 'cancel' }
/** Most simultaneously open cards; extra requests are cancelled. */
const PENDING_LIMIT = 8
/** Unanswered requests are cancelled after this delay. */
const DEFAULT_TIMEOUT = 10 * 60_000

/** One open card, or an accepted link waiting for the agent's completion notice. */
interface Entry {
  /** Agent preset id. */
  agentId: string
  /** ACP session asking. */
  sessionId: string
  /** Form fields, validated again on submit. */
  fields?: UiAgentElicitationField[]
  /** Link identity the agent completes later. */
  elicitationId?: string
  /** Answers the agent request; undefined once a link was accepted. */
  finish?: (value: CreateElicitationResponse) => void
  /** Expiry timer. */
  timer: ReturnType<typeof setTimeout>
}

/**
 * Mediates agent requests for user input (forms and links) for in-thread cards.
 * Entered values are only forwarded to the agent; they are never emitted or stored.
 */
export function createElicitationBroker(options: {
  /** Redacts known secrets from agent text. */
  sanitize: (text: string) => string
  /** Emits one safe card. */
  emit: (value: UiAgentElicitation) => void
  /** Notifies browsers that a card is gone. */
  resolved: (value: UiAgentElicitationResolved) => void
  /** Thread whose active prompt owns an agent session. */
  threadOf: (agentId: string, sessionId: string) => string | undefined
  /** Unanswered request lifetime. */
  timeoutMs?: number
}) {
  const entries = new Map<string, Entry>()
  let closed = false

  /**
   * Removes one entry, answering the agent if it still waits.
   * @param requestId Broker-owned identity.
   * @param response Answer for a waiting agent request.
   * @param reason Removal cause sent to browsers.
   */
  function finish(requestId: string, response: CreateElicitationResponse, reason: UiAgentElicitationResolved['reason']): void {
    const entry = entries.get(requestId)
    if (!entry) return
    entries.delete(requestId)
    clearTimeout(entry.timer)
    entry.finish?.(response)
    options.resolved({ requestId, reason })
  }

  /** Cancels every entry of an agent, one of its sessions, or all of them. */
  function cancel(agentId?: string, sessionId?: string): void {
    for (const [id, entry] of entries) {
      if ((!agentId || entry.agentId === agentId) && (!sessionId || entry.sessionId === sessionId)) finish(id, cancelled, 'cancelled')
    }
  }

  return {
    /**
     * Shows one agent request in its thread and waits for the user.
     * @param agentId Agent preset id.
     * @param request Agent elicitation request.
     * @param signal Agent-side cancellation.
     */
    request(agentId: string, request: CreateElicitationRequest, signal?: AbortSignal): Promise<CreateElicitationResponse> {
      const sessionId = 'sessionId' in request && typeof request.sessionId === 'string' ? request.sessionId : undefined
      const threadId = sessionId && options.threadOf(agentId, sessionId)
      if (closed || signal?.aborted || !sessionId || !threadId || entries.size >= PENDING_LIMIT) return Promise.resolve(cancelled)
      const projected = projectElicitation(request, options.sanitize)
      if (!projected) return Promise.resolve({ action: 'decline' })
      return new Promise((resolve) => {
        const requestId = randomUUID()
        const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT
        const timer = setTimeout(() => finish(requestId, cancelled, 'expired'), timeout)
        timer.unref?.()
        const { elicitationId, ...card } = projected as typeof projected & { elicitationId?: string }
        entries.set(requestId, { agentId, sessionId, fields: card.mode === 'form' ? card.fields : undefined, elicitationId, finish: resolve, timer })
        signal?.addEventListener('abort', () => finish(requestId, cancelled, 'cancelled'), { once: true })
        options.emit({ ...card, requestId, agentId, threadId, expiresAt: new Date(Date.now() + timeout).toISOString() } as UiAgentElicitation)
      })
    },
    /**
     * Applies one browser answer; returns false when form content is invalid and the card stays open.
     * An accepted link stays listed until the agent completes it or the turn ends.
     * @param requestId Broker-owned identity.
     * @param action Submit, skip, or dismiss.
     * @param content Submitted form values, validated against the card's fields.
     */
    reply(requestId: UiAgentElicitationReply['requestId'], action: UiAgentElicitationReply['action'], content?: unknown): boolean {
      const entry = entries.get(requestId)
      if (!entry) return false
      if (!entry.finish || action !== 'accept') {
        finish(requestId, { action }, 'answered')
        return true
      }
      if (entry.elicitationId) {
        entry.finish({ action: 'accept' })
        entry.finish = undefined
        return true
      }
      const checked = validateElicitationContent(entry.fields ?? [], content ?? {})
      if ('errors' in checked) return false
      finish(requestId, { action: 'accept', content: checked.content }, 'answered')
      return true
    },
    /**
     * Agent finished a link flow out of band.
     * @param agentId Agent preset id.
     * @param elicitationId Agent link identity.
     */
    complete(agentId: string, elicitationId: string): void {
      for (const [id, entry] of entries) {
        if (entry.agentId === agentId && entry.elicitationId === elicitationId) finish(id, cancelled, 'completed')
      }
    },
    cancel,
    /** Ends a prompt: its unanswered cards are cancelled. */
    settle(agentId: string, sessionId: string): void { cancel(agentId, sessionId) },
    /** Cancels everything before the runtime retires. */
    close(): void {
      closed = true
      cancel()
    },
  }
}
