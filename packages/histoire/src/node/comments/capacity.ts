import type { UiAgentPlanDecision, UiAgentThreadBase, UiAiThread, UiCommentMessage } from '@histoire/shared'
import type { ThreadFileCodec } from './file.js'
import type { CommentAgentReply } from './store.js'
import { Buffer } from 'node:buffer'
import { commentsFileBytes, defaultCodec } from './file.js'
import { COMMENT_AGENT_REPLY_BYTES, COMMENT_BYTE_LIMIT, COMMENT_DECISION_LIMIT, COMMENT_DECISION_PLAN_CHARS, COMMENT_FILE_BYTE_LIMIT, COMMENT_MESSAGE_LIMIT, COMMENT_PLAN_LIMIT, COMMENT_STEP_LIMIT } from './limits.js'
import { validateCommentMessage } from './validate.js'

/** Safe user-facing admission failure; no agent is dispatched for this error. */
export class CommentCapacityError extends Error {
  /** Preserve exact history and tell callers how to continue. */
  constructor() {
    super('Comment reply capacity reached. Start a new thread to continue; existing history is preserved.')
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
export function assertCommentReplyCapacity(comment: UiAgentThreadBase, agentId: string): void {
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
export function reserveCommentFileReplyCapacity<T extends UiAgentThreadBase = UiAiThread>(comments: readonly T[], comment: T, agentId: string, reservations: ReadonlyMap<string, UiCommentMessage>, codec: ThreadFileCodec<T> = defaultCodec<T>()): UiCommentMessage {
  assertCommentReplyCapacity(comment, agentId)
  const reply = reservedCommentAgentReply(agentId)
  const projected = comments.map((value) => {
    const reserved = value.id === comment.id ? reply : reservations.get(value.id)
    return reserved
      ? { ...value, ...(value.id === comment.id ? { status: 'sent' as const, agentId } : {}), thread: [...value.thread, reserved] }
      : value
  })
  if (commentsFileBytes(projected, codec) > COMMENT_FILE_BYTE_LIMIT) throw new CommentCapacityError()
  return reply
}

/** Visible note ending plan text shortened for persistence. */
const PLAN_TRUNCATED = '\n\n[Plan truncated to fit comment capacity.]'

/**
 * Plan text within `limit` characters, marking any cut.
 * @param plan Plan markdown.
 * @param limit Maximum length, note included.
 */
function clipPlan(plan: string, limit: number): string {
  return plan.length <= limit ? plan : `${plan.slice(0, limit - PLAN_TRUNCATED.length).replace(/[\uD800-\uDBFF]$/, '')}${PLAN_TRUNCATED}`
}

/** Keep success text and useful change metadata; every omission is explicit in the reply. */
export function boundedCommentAgentReply(result: CommentAgentReply, agentId: string): UiCommentMessage {
  // An agent ending its turn after "Keep planning" has nothing to say; name what happened.
  const empty = result.decisions?.at(-1)?.outcome === 'kept-planning' ? 'Kept planning.' : 'Agent completed without a text reply.'
  const raw = result.text.trim() ? result.text : empty
  const normalized = raw.replaceAll('\0', '')
  const text = normalized.trim() ? normalized : empty
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
  // Steps are display-only; keep the most recent ones and shorten titles for persistence.
  const steps = (result.steps ?? []).slice(-COMMENT_STEP_LIMIT).map(step => ({ ...step, title: step.title.slice(0, 120) }))
  let plan = result.plan?.length ? result.plan.slice(0, COMMENT_PLAN_LIMIT) : undefined
  // Latest plan decisions, each with its own plan text length budget.
  const sources: UiAgentPlanDecision[] = (result.decisions ?? []).slice(-COMMENT_DECISION_LIMIT).map(item => ({ outcome: item.outcome, plan: item.plan.replaceAll('\0', '') }))
  const planLimits = sources.map(item => Math.min(item.plan.length, COMMENT_DECISION_PLAN_CHARS))
  const decisions = () => sources.map((item, index) => ({ outcome: item.outcome, plan: clipPlan(item.plan, planLimits[index]) }))
  /** JSON escaping and Unicode bytes count toward capacity, not source character count. */
  function message(length: number): UiCommentMessage {
    const prefix = text.slice(0, length).replace(/[\uD800-\uDBFF]$/, '')
    const notes = [
      ...(prefix.length < text.length ? ['[Reply truncated to fit comment capacity.]'] : []),
      ...(omitted ? [`[Omitted ${omitted} reported file changes.]`] : []),
      ...(raw !== text ? ['[Removed unsupported text characters.]'] : []),
    ]
    return { author: 'agent', agentId, at, body: [prefix, ...notes].join('\n\n'), ...(changes.length ? { changes } : {}), ...(steps.length ? { steps } : {}), ...(plan ? { plan } : {}), ...(sources.length ? { decisions: decisions() } : {}) }
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
  /** Complete reply text no longer fits the byte budget. */
  const over = () => Buffer.byteLength(JSON.stringify(message(Math.min(text.length, 8192)))) > COMMENT_AGENT_REPLY_BYTES
  // Prefer complete outcome text over activity history, plans, then agent-reported paths.
  while (steps.length && over()) steps.shift()
  if (plan && over()) plan = undefined
  // Halve the longest plan text until short, then drop the oldest decision.
  while (sources.length && over()) {
    const longest = planLimits.indexOf(Math.max(...planLimits))
    if (planLimits[longest] > 512) {
      planLimits[longest] = Math.floor(planLimits[longest] / 2)
    }
    else {
      sources.shift()
      planLimits.shift()
    }
  }
  while (changes.length && over()) {
    changes.pop()
    omitted++
  }
  return validateCommentMessage(fit())
}
