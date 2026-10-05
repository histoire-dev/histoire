/** One user-created canvas annotation persisted only in development. */
export interface UiComment {
  /** Opaque UUID; never a file path. */
  id: string
  /** Exact collected story identity. */
  storyId: string
  /** Exact collected variant identity. */
  variantId: string
  /** Logical frame coordinates and optional picked element selector. */
  anchor: { selector?: string, x: number, y: number }
  /** Optional JSON-safe prop context captured when composed. */
  props?: Record<string, unknown>
  /** Optional project-relative generated screenshot. */
  screenshot?: string
  /** Original user message. */
  body: string
  /** Server-owned delivery lifecycle. */
  status: 'draft' | 'sent' | 'working' | 'replied' | 'resolved'
  /** Agent preset handling this thread. */
  agentId?: string
  /** Chronological user and agent replies. */
  thread: UiCommentMessage[]
  /** UTC creation date. */
  createdAt: string
  /** UTC last mutation date. */
  updatedAt: string
}

/** One plain-text comment message and optional agent-reported file edits. */
export interface UiCommentMessage {
  /** Message origin. */
  author: 'user' | 'agent'
  /** Agent preset, when reported by an agent. */
  agentId?: string
  /** Plain-text content. */
  body: string
  /** UTC message time. */
  at: string
  /** Project-relative changes reported by the agent. */
  changes?: { file: string, added: number, removed: number }[]
}

/** Writable draft fields; server owns lifecycle, timestamps and agent replies. */
export type UiCommentDraft = Pick<UiComment, 'id' | 'storyId' | 'variantId' | 'anchor' | 'body' | 'props' | 'screenshot'>

/** Browser-owned ID lets a failed save retire only its originating composer request. */
export interface UiCommentRequest {
  /** Opaque browser request identity. */
  requestId?: string
}

/** Snapshots are split into bounded parts and installed atomically by the client. */
export interface UiCommentsSnapshot {
  /** Whether this dev generation enables annotations. */
  enabled: boolean
  /** Snapshot publication identity. */
  revision: string
  /** Zero-based part number. */
  part: number
  /** Total parts in this publication. */
  total: number
  /** Comments within this bounded part. */
  comments: UiComment[]
  /** Deliberate recoverable server/storage failure. */
  error?: string
  /** Request owning this private failure publication, when applicable. */
  requestId?: string
}

/** Agent picker receives display status only, never commands or environment. */
export interface UiCommentAgent {
  /** Configured preset identity. */
  id: string
  /** Display label. */
  name: string
  /** Published ACP connection state. */
  state: string
  /** User-selected default destination, from merged ACP preferences. */
  default?: boolean
  /** Require an explicit destination for each new send. */
  askEachTime?: boolean
}

declare module './ui-channel.js' {
  interface UiClientEvents {
    /** Save user-writable draft content. */
    'histoire:ui:comment-upsert': UiCommentDraft & UiCommentRequest
    /** Remove an existing comment. */
    'histoire:ui:comment-delete': { id: string }
    /** Resolve or reopen an existing comment. */
    'histoire:ui:comment-resolve': { id: string, resolved: boolean }
    /** Add a user reply to a thread. */
    'histoire:ui:comment-reply': { id: string, body: string }
    /** Send ordered draft/replied comments to one configured agent. */
    'histoire:ui:comment-send': { ids: string[], agentId: string, draft?: UiCommentDraft } & UiCommentRequest
  }
  interface UiServerEvents {
    /** Bounded complete persisted-comment snapshot publication. */
    'histoire:ui:comments-snapshot': UiCommentsSnapshot
  }
}
