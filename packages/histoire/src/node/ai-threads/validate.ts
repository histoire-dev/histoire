import type { UiAiThread, UiAiThreadContext, UiAiThreadDraft } from '@histoire/shared'
import type { ThreadFileCodec } from '../comments/file.js'
import { Buffer } from 'node:buffer'
import { COMMENT_BYTE_LIMIT, COMMENT_MESSAGE_LIMIT } from '../comments/limits.js'
import { commentId, validateCommentAnchor, validateCommentAttachments, validateCommentMessage, validateCommentOptions, validateCommentProps, validateCommentScreenshot } from '../comments/validate.js'

/** Server-side draft: client fields plus the derived title. */
export type AiThreadDraftInput = UiAiThreadDraft & Pick<UiAiThread, 'title'>

/** Maximum title length derived from the first message. */
const TITLE_LENGTH = 80

/**
 * Bounded non-empty user text.
 * @param value Untrusted value.
 * @param maximum Maximum length.
 * @param label Field label for the error.
 */
function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) throw new Error(`Invalid AI thread ${label}`)
  return value
}

/**
 * First non-empty line of the first message, shortened for the thread list.
 * @param body First user message.
 */
export function aiThreadTitle(body: string): string {
  const line = body.split('\n').map(value => value.trim()).find(Boolean) ?? ''
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1)}…` : line
}

/**
 * Optional story context, shape only; existence is checked against collected stories.
 * @param value Untrusted value.
 */
function validateContext(value: unknown): UiAiThreadContext | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid AI thread context')
  const input = value as Record<string, unknown>
  return { storyId: text(input.storyId, 2048, 'story'), ...(input.variantId === undefined ? {} : { variantId: text(input.variantId, 2048, 'variant') }) }
}

/**
 * Pin fields of a canvas comment; only an anchored thread on an exact variant may carry them.
 * @param input Untrusted draft fields.
 * @param context Validated story context.
 */
function validatePin(input: Record<string, unknown>, context: UiAiThreadContext | undefined): Pick<UiAiThread, 'anchor' | 'props' | 'screenshot'> {
  if (input.anchor === undefined) {
    if (input.props !== undefined || input.screenshot !== undefined) throw new Error('Invalid AI thread pin')
    return {}
  }
  if (!context?.variantId) throw new Error('Pinned AI thread needs a variant')
  const props = validateCommentProps(input.props)
  const screenshot = validateCommentScreenshot(input.screenshot)
  return { anchor: validateCommentAnchor(input.anchor), ...(props ? { props } : {}), ...(screenshot ? { screenshot } : {}) }
}

/**
 * Project client-writable fields and derive the title; lifecycle never trusts the browser.
 * @param value Untrusted draft.
 */
export function validateAiThreadDraft(value: unknown): AiThreadDraftInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI thread')
  const input = value as Record<string, unknown>
  const body = text(input.body, 8192, 'body')
  const context = validateContext(input.context)
  const attachments = validateCommentAttachments(input.attachments)
  return { id: commentId(input.id), body, title: aiThreadTitle(body), ...(context ? { context } : {}), ...validatePin(input, context), ...(attachments ? { attachments } : {}) }
}

/**
 * Corrupt persisted data is reported without overwriting the original bytes.
 * @param value Persisted record.
 */
export function validateAiThread(value: unknown): UiAiThread {
  const draft = validateAiThreadDraft(value)
  const input = value as Record<string, any>
  if (!['draft', 'sent', 'working', 'replied', 'resolved'].includes(input.status) || !Array.isArray(input.thread) || input.thread.length > COMMENT_MESSAGE_LIMIT || !Number.isFinite(Date.parse(input.createdAt)) || !Number.isFinite(Date.parse(input.updatedAt))) throw new Error('Invalid persisted AI thread')
  const options = validateCommentOptions(input.options)
  const thread: UiAiThread = { ...draft, status: input.status, thread: input.thread.map(validateCommentMessage), createdAt: input.createdAt, updatedAt: input.updatedAt, ...(input.agentId === undefined ? {} : { agentId: text(input.agentId, 128, 'agent') }), ...(options ? { options } : {}) }
  if (Buffer.byteLength(JSON.stringify(thread)) > COMMENT_BYTE_LIMIT) throw new Error('AI thread exceeds 48 KB')
  return thread
}

/** AI threads in `.histoire/threads.json`. */
export const aiThreadsCodec: ThreadFileCodec<UiAiThread> = { key: 'threads', label: 'AI threads', validate: validateAiThread }

/** Project-relative file of every conversation, pinned or not. */
export const THREADS_FILE = '.histoire/threads.json'
