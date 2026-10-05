import type { UiComment, UiCommentDraft, UiCommentMessage } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { COMMENT_BYTE_LIMIT, COMMENT_MESSAGE_LIMIT } from './limits.js'

/** User fields stay bounded before file IO or agent prompt construction. */
function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) throw new Error(`Invalid comment ${label}`)
  return value
}

/** UUIDs are opaque labels and never participate in filesystem paths. */
export function commentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) throw new Error('Invalid comment ID')
  return value
}

/** Keep attachments within the existing screenshot inventory. */
function screenshot(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^\.histoire\/screenshots\/[\w-]+\.(?:png|webp)$/i.test(value)) throw new Error('Invalid comment screenshot')
  return value
}

/** Project only client-writable data; lifecycle and replies never trust the browser. */
export function validateCommentDraft(value: unknown): UiCommentDraft {
  if (!value || typeof value !== 'object') throw new Error('Invalid comment')
  const input = value as Record<string, any>
  const anchor = input.anchor
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || anchor.x < 0 || anchor.y < 0 || anchor.x > 1e6 || anchor.y > 1e6) throw new Error('Invalid comment anchor')
  let props: Record<string, unknown> | undefined
  if (input.props !== undefined) {
    if (!input.props || typeof input.props !== 'object' || Array.isArray(input.props)) throw new Error('Invalid comment props')
    const json = JSON.stringify(input.props)
    if (Buffer.byteLength(json) > 16 * 1024) throw new Error('Comment props exceed 16 KB')
    props = JSON.parse(json)
  }
  return { id: commentId(input.id), storyId: text(input.storyId, 2048, 'story'), variantId: text(input.variantId, 2048, 'variant'), anchor: { x: anchor.x, y: anchor.y, ...(anchor.selector === undefined ? {} : { selector: text(anchor.selector, 4096, 'selector') }) }, body: text(input.body, 8192, 'body'), props, screenshot: screenshot(input.screenshot) }
}

/** Preserve only project-relative agent-reported edits with finite line counts. */
export function validateCommentMessage(value: unknown): UiCommentMessage {
  if (!value || typeof value !== 'object') throw new Error('Invalid comment reply')
  const input = value as Record<string, any>
  if (!['user', 'agent'].includes(input.author) || !Number.isFinite(Date.parse(input.at))) throw new Error('Invalid comment reply')
  const changes = input.changes === undefined
    ? undefined
    : Array.isArray(input.changes)
      ? input.changes.slice(0, 32).map((change: any) => {
          if (!change || typeof change.file !== 'string' || change.file.length > 512 || change.file.startsWith('/') || change.file.includes('\\') || change.file.split('/').includes('..') || !Number.isSafeInteger(change.added) || !Number.isSafeInteger(change.removed) || change.added < 0 || change.removed < 0) throw new Error('Invalid comment change')
          return { file: change.file, added: change.added, removed: change.removed }
        })
      : (() => { throw new Error('Invalid comment changes') })()
  return { author: input.author, body: text(input.body, 8192, 'reply'), at: input.at, agentId: input.agentId === undefined ? undefined : text(input.agentId, 128, 'agent'), changes }
}

/** Corrupt persisted data is reported without overwriting the original bytes. */
export function validateComment(value: unknown): UiComment {
  const draft = validateCommentDraft(value)
  const input = value as Record<string, any>
  if (!['draft', 'sent', 'working', 'replied', 'resolved'].includes(input.status) || !Array.isArray(input.thread) || input.thread.length > COMMENT_MESSAGE_LIMIT || !Number.isFinite(Date.parse(input.createdAt)) || !Number.isFinite(Date.parse(input.updatedAt))) throw new Error('Invalid persisted comment')
  const comment: UiComment = { ...draft, status: input.status, thread: input.thread.map(validateCommentMessage), createdAt: input.createdAt, updatedAt: input.updatedAt, agentId: input.agentId === undefined ? undefined : text(input.agentId, 128, 'agent') }
  if (Buffer.byteLength(JSON.stringify(comment)) > COMMENT_BYTE_LIMIT) throw new Error('Comment exceeds 48 KB')
  return comment
}
