import type { UiComment, UiCommentMessage } from '@histoire/shared'
import type { CommentAgentReply } from './store.js'
import { Buffer } from 'node:buffer'
import { commentsFileBytes } from './file.js'
import { COMMENT_AGENT_REPLY_BYTES, COMMENT_BYTE_LIMIT, COMMENT_FILE_BYTE_LIMIT, COMMENT_MESSAGE_LIMIT } from './limits.js'
import { validateCommentMessage } from './validate.js'

/** Safe user-facing admission failure; no agent is dispatched for this error. */
export class CommentCapacityError extends Error {
  /** Preserve exact history and tell callers how to continue. */
  constructor() {
    super('Comment reply capacity reached. Start a new comment to continue; existing history is preserved.')
    this.name = 'CommentCapacityError'
  }
}

/** Successful execution and persistence failure stay separate in caller-visible recovery. */
export class CommentReplyStorageError extends Error {
  /** Never describe a completed agent request as failed. */
  constructor(cause?: unknown) {
    super('Agent completed, but its comment reply could not be stored. Existing history is preserved.', { cause })
    this.name = 'CommentReplyStorageError'
  }
}

/** Reserve one complete bounded reply without dropping any existing messages. */
export function assertCommentReplyCapacity(comment: UiComment, agentId: string): void {
  // Resolution can change during execution; reserve the longest terminal label.
  const pending = { ...comment, status: 'resolved', agentId, updatedAt: new Date().toISOString() }
  if (comment.thread.length >= COMMENT_MESSAGE_LIMIT || Buffer.byteLength(JSON.stringify(pending)) + COMMENT_AGENT_REPLY_BYTES + 1 > COMMENT_BYTE_LIMIT) throw new CommentCapacityError()
}

/** Build the largest valid reply shape so formatted file admission never under-reserves it. */
function reservedCommentAgentReply(agentId: string): UiCommentMessage {
  const changes = Array.from({ length: 32 }, () => ({ file: 'x', added: Number.MAX_SAFE_INTEGER, removed: Number.MAX_SAFE_INTEGER }))
  const base = { author: 'agent' as const, agentId, at: new Date(0).toISOString(), changes }
  let lower = 0
  let upper = 8192
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    const value = { ...base, body: '\u0001'.repeat(middle) }
    if (Buffer.byteLength(JSON.stringify(value)) <= COMMENT_AGENT_REPLY_BYTES) lower = middle
    else upper = middle - 1
  }
  return { ...base, body: '\u0001'.repeat(lower) }
}

/** Reserve encoded document capacity for this reply plus every other pending physical-file reply. */
export function reserveCommentFileReplyCapacity(comments: readonly UiComment[], comment: UiComment, agentId: string, reservations: ReadonlyMap<string, UiCommentMessage>): UiCommentMessage {
  assertCommentReplyCapacity(comment, agentId)
  const reply = reservedCommentAgentReply(agentId)
  const projected = comments.map((value) => {
    const reserved = value.id === comment.id ? reply : reservations.get(value.id)
    return reserved
      ? { ...value, ...(value.id === comment.id ? { status: 'sent' as const, agentId } : {}), thread: [...value.thread, reserved] }
      : value
  })
  if (commentsFileBytes(projected) > COMMENT_FILE_BYTE_LIMIT) throw new CommentCapacityError()
  return reply
}

/** Keep success text and useful change metadata; every omission is explicit in the reply. */
export function boundedCommentAgentReply(result: CommentAgentReply, agentId: string): UiCommentMessage {
  const raw = result.text.trim() ? result.text : 'Agent completed without a text reply.'
  const normalized = raw.replaceAll('\0', '')
  const text = normalized.trim() ? normalized : 'Agent completed without a text reply.'
  const at = new Date().toISOString()
  const changes: NonNullable<UiCommentMessage['changes']> = []
  let omitted = 0
  for (const change of result.changes ?? []) {
    try {
      const value = validateCommentMessage({ author: 'agent', body: 'Completed', at, changes: [change] }).changes![0]
      if (changes.length < 32) changes.push(value)
      else omitted++
    }
    catch { omitted++ }
  }
  /** JSON escaping and Unicode bytes count toward capacity, not source character count. */
  function message(length: number): UiCommentMessage {
    const prefix = text.slice(0, length).replace(/[\uD800-\uDBFF]$/, '')
    const notes = [
      ...(prefix.length < text.length ? ['[Reply truncated to fit comment capacity.]'] : []),
      ...(omitted ? [`[Omitted ${omitted} reported file changes.]`] : []),
      ...(raw !== text ? ['[Removed unsupported text characters.]'] : []),
    ]
    return { author: 'agent', agentId, at, body: [prefix, ...notes].join('\n\n'), ...(changes.length ? { changes } : {}) }
  }
  /** Largest visible text prefix under both validated character and encoded-byte limits. */
  function fit(): UiCommentMessage {
    const complete = message(Math.min(text.length, 8192))
    if (complete.body.length <= 8192 && Buffer.byteLength(JSON.stringify(complete)) <= COMMENT_AGENT_REPLY_BYTES) return complete
    let lower = 0
    let upper = Math.min(text.length, 8192)
    while (lower < upper) {
      const middle = Math.ceil((lower + upper) / 2)
      const value = message(middle)
      if (value.body.length <= 8192 && Buffer.byteLength(JSON.stringify(value)) <= COMMENT_AGENT_REPLY_BYTES) lower = middle
      else upper = middle - 1
    }
    return message(lower)
  }
  // Prefer complete outcome text over a long list of agent-reported paths.
  while (changes.length && Buffer.byteLength(JSON.stringify(message(Math.min(text.length, 8192)))) > COMMENT_AGENT_REPLY_BYTES) {
    changes.pop()
    omitted++
  }
  return validateCommentMessage(fit())
}
