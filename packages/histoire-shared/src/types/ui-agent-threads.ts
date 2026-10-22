import type { UiCommentAttachment, UiCommentMessage, UiCommentSessionOptions } from './ui-comments.js'

/** Fields shared by every persisted agent conversation (canvas comments, AI threads). */
export interface UiAgentThreadBase {
  /** Opaque UUID; never a file path. */
  id: string
  /** Original user message. */
  body: string
  /** Files imported, dropped or pasted with the original message. */
  attachments?: UiCommentAttachment[]
  /** Agent session choices sent with this conversation. */
  options?: UiCommentSessionOptions
  /** Server-owned delivery lifecycle. */
  status: 'draft' | 'sent' | 'working' | 'replied' | 'resolved'
  /** Agent preset handling this conversation. */
  agentId?: string
  /** Chronological user and agent replies. */
  thread: UiCommentMessage[]
  /** UTC creation date. */
  createdAt: string
  /** UTC last mutation date. */
  updatedAt: string
}
