import type { UiAgentThreadBase } from './ui-agent-threads.js'
import type { UiCommentAttachment, UiCommentRequest, UiCommentSessionOptions } from './ui-comments.js'

/** Story attached to an AI thread as optional context. */
export interface UiAiThreadContext {
  /** Exact collected story identity. */
  storyId: string
  /** Exact variant identity, when one was selected. */
  variantId?: string
}

/** Canvas point a pinned thread is attached to, in logical frame coordinates. */
export interface UiAiThreadAnchor {
  /** Horizontal frame coordinate. */
  x: number
  /** Vertical frame coordinate. */
  y: number
  /** Picked element selector, when the point targets an element. */
  selector?: string
}

/**
 * Agent conversation persisted only in development. Free-form threads may carry story context;
 * pinned threads (canvas comments) also carry a canvas anchor on an exact variant.
 */
export interface UiAiThread extends UiAgentThreadBase {
  /** Server-derived label from the first message. */
  title: string
  /** Optional story context; pinned threads always name a variant. */
  context?: UiAiThreadContext
  /** Canvas point; present only on pinned threads. */
  anchor?: UiAiThreadAnchor
  /** JSON-safe prop snapshot captured with a pinned thread. */
  props?: Record<string, unknown>
  /** Project-relative generated screenshot of a pinned thread. */
  screenshot?: string
}

/** A thread pinned on the canvas: anchored to an exact variant. */
export type UiPinnedAiThread = UiAiThread & { anchor: UiAiThreadAnchor, context: Required<UiAiThreadContext> }

/** Writable fields of a new thread; server owns title, lifecycle and replies. */
export type UiAiThreadDraft = Pick<UiAiThread, 'id' | 'body' | 'attachments' | 'context' | 'anchor' | 'props' | 'screenshot'>

/**
 * Whether a thread or draft is pinned on the canvas.
 * @param thread Thread or draft.
 */
export function isPinnedThread<T extends Pick<UiAiThread, 'anchor' | 'context'>>(thread: T): thread is T & Pick<UiPinnedAiThread, 'anchor' | 'context'> {
  return Boolean(thread.anchor && thread.context?.variantId)
}

/** Snapshots are split into bounded parts and installed atomically by the client. */
export interface UiAiThreadsSnapshot {
  /** Whether this dev generation enables AI threads. */
  enabled: boolean
  /** Whether canvas pins (comments) are enabled; `comments.enabled: false` turns them off. */
  pinsEnabled: boolean
  /** Snapshot publication identity. */
  revision: string
  /** Zero-based part number. */
  part: number
  /** Total parts in this publication. */
  total: number
  /** Threads within this bounded part. */
  threads: UiAiThread[]
  /** Deliberate recoverable server/storage failure. */
  error?: string
  /** Request owning this private failure publication, when applicable. */
  requestId?: string
}

declare module './ui-channel.js' {
  interface UiClientEvents {
    /** Save a draft thread without sending it (pinned canvas drafts). */
    'histoire:ui:ai-thread-save': { draft: UiAiThreadDraft } & UiCommentRequest
    /** Create a thread and send it to one configured agent in one request. */
    'histoire:ui:ai-thread-create': { draft: UiAiThreadDraft, agentId: string, options?: UiCommentSessionOptions } & UiCommentRequest
    /** Add a user reply and continue the thread conversation. */
    'histoire:ui:ai-thread-reply': { id: string, body: string, agentId?: string, attachments?: UiCommentAttachment[], options?: UiCommentSessionOptions }
    /** Archive or restore an existing thread. */
    'histoire:ui:ai-thread-archive': { id: string, archived: boolean }
    /** Remove an existing thread. */
    'histoire:ui:ai-thread-delete': { id: string }
  }
  interface UiServerEvents {
    /** Bounded complete persisted-thread snapshot publication. */
    'histoire:ui:ai-threads-snapshot': UiAiThreadsSnapshot
  }
}
