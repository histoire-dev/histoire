import type { UiAgentStep, UiAiThreadAnchor, UiCommentAttachment, UiCommentMessage, UiCommentSessionOptions } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { COMMENT_ATTACHMENT_LIMIT } from '@histoire/shared'
import { ATTACHMENT_BYTES, attachmentName } from './attachments.js'
import { COMMENT_STEP_LIMIT } from './limits.js'

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

/** Stored attachment references keep generated paths and bounded display metadata only. */
export function validateCommentAttachments(value: unknown): UiCommentAttachment[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > COMMENT_ATTACHMENT_LIMIT) throw new Error('Invalid comment attachments')
  return value.map((item: any) => {
    if (!item || typeof item.path !== 'string' || !attachmentName(item.path) || typeof item.mimeType !== 'string' || !/^[\w.+-]{1,60}\/[\w.+-]{1,60}$/.test(item.mimeType) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > ATTACHMENT_BYTES) throw new Error('Invalid comment attachment')
    return { path: item.path, name: text(item.name, 200, 'attachment'), mimeType: item.mimeType, size: item.size }
  })
}

/** Session choices are opaque agent value IDs. */
export function validateCommentOptions(value: unknown): UiCommentSessionOptions | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid comment options')
  const input = value as Record<string, unknown>
  const result: UiCommentSessionOptions = {}
  for (const field of ['model', 'effort', 'mode'] as const) {
    if (input[field] !== undefined) result[field] = text(input[field], 200, 'option')
  }
  return result
}

/**
 * Canvas point of a pinned thread, in bounded logical frame coordinates.
 * @param value Untrusted anchor.
 */
export function validateCommentAnchor(value: unknown): UiAiThreadAnchor {
  const anchor = value as Record<string, any> | undefined
  if (!anchor || typeof anchor !== 'object' || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || anchor.x < 0 || anchor.y < 0 || anchor.x > 1e6 || anchor.y > 1e6) throw new Error('Invalid comment anchor')
  return { x: anchor.x, y: anchor.y, ...(anchor.selector === undefined ? {} : { selector: text(anchor.selector, 4096, 'selector') }) }
}

/**
 * JSON-safe prop snapshot, at most 16 KB once serialized.
 * @param value Untrusted props.
 */
export function validateCommentProps(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid comment props')
  const json = JSON.stringify(value)
  if (Buffer.byteLength(json) > 16 * 1024) throw new Error('Comment props exceed 16 KB')
  // Round-trip drops functions, undefined values and prototypes.
  return JSON.parse(json)
}

/**
 * Generated screenshot path; existence is checked against the screenshot inventory.
 * @param value Untrusted project-relative path.
 */
export function validateCommentScreenshot(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^\.histoire\/screenshots\/[\w-]+\.(?:png|webp)$/i.test(value)) throw new Error('Invalid comment screenshot')
  return value
}

/** Persisted agent step kinds and statuses mirror ACP tool calls. */
const STEP_KINDS = ['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'other']
const STEP_STATUSES = ['pending', 'in_progress', 'completed', 'failed']

/** Optional non-negative line count. */
function lineCount(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Invalid comment step')
  return value as number
}

/** Agent steps keep only display fields; arguments and outputs are never persisted. */
function validateCommentSteps(value: unknown): UiAgentStep[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > COMMENT_STEP_LIMIT) throw new Error('Invalid comment steps')
  return value.map((step: any) => {
    if (!step || !STEP_KINDS.includes(step.kind) || !STEP_STATUSES.includes(step.status)) throw new Error('Invalid comment step')
    const target = step.target === undefined ? undefined : text(step.target, 512, 'step target')
    if (target && (target.startsWith('/') || target.split('/').includes('..'))) throw new Error('Invalid comment step')
    const added = lineCount(step.added)
    const removed = lineCount(step.removed)
    return { id: text(step.id, 200, 'step'), kind: step.kind, title: text(step.title, 300, 'step title'), status: step.status, ...(target ? { target } : {}), ...(added === undefined ? {} : { added }), ...(removed === undefined ? {} : { removed }) }
  })
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
  return { author: input.author, body: text(input.body, 8192, 'reply'), at: input.at, agentId: input.agentId === undefined ? undefined : text(input.agentId, 128, 'agent'), changes, ...(input.failed === true && input.author === 'agent' ? { failed: true } : {}), ...(input.author === 'agent' && input.steps !== undefined ? { steps: validateCommentSteps(input.steps) } : {}), ...(input.author === 'user' && input.attachments !== undefined ? { attachments: validateCommentAttachments(input.attachments) } : {}) }
}
