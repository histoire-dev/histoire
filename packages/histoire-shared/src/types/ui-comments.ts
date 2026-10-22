import type { UiAgentCommand, UiAgentStep } from './ui-agents.js'

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
  /** Server-written notice that the agent request failed; thread stays unsent. */
  failed?: boolean
  /** Agent tool calls and thinking spans performed for this reply, in order. */
  steps?: UiAgentStep[]
  /** Files attached to a user reply. */
  attachments?: UiCommentAttachment[]
}

/** Most files attached to one comment message, enforced by client and server. */
export const COMMENT_ATTACHMENT_LIMIT = 8

/** One stored file attached to a comment message. */
export interface UiCommentAttachment {
  /** Project-relative stored file beneath `.histoire/attachments`. */
  path: string
  /** Original display filename. */
  name: string
  /** Verified media type. */
  mimeType: string
  /** Byte size. */
  size: number
}

/** Agent session configuration value IDs, keyed by selector category. */
export interface UiCommentSessionOptions {
  /** Model choice value. */
  model?: string
  /** Thought-level choice value. */
  effort?: string
  /** Session mode choice value. */
  mode?: string
}

/** Project file suggested for an `@` mention. */
export interface UiProjectFile {
  /** Project-relative POSIX path. */
  path: string
  /** File name. */
  basename: string
  /** Parent directory, empty at root. */
  dirname: string
}

/** Browser-owned ID lets a failed save retire only its originating composer request. */
export interface UiCommentRequest {
  /** Opaque browser request identity. */
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
  /** Same-origin monochrome registry logo URL, when the preset comes from the ACP registry. */
  icon?: string
  /** Slash commands last advertised by this agent. */
  commands?: UiAgentCommand[]
}
