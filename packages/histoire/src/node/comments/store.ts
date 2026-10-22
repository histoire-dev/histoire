import type { UiAgentStep, UiAgentThreadBase, UiAiThread, UiCommentAttachment, UiCommentMessage, UiCommentSessionOptions } from '@histoire/shared'
import type { AiThreadDraftInput } from '../ai-threads/validate.js'
import type { ThreadFileCodec } from './file.js'
import { validateAiThreadDraft } from '../ai-threads/validate.js'
import { removeAttachments } from './attachments.js'
import { boundedCommentAgentReply, CommentCapacityError, CommentReplyStorageError, reserveCommentFileReplyCapacity } from './capacity.js'
import { commentsFileBytes, commentsFileIdentity, defaultCodec, readCommentsFile, withCommentsFileLock, writeCommentsFile } from './file.js'
import { COMMENT_FILE_BYTE_LIMIT } from './limits.js'
import { commentAttachments } from './prompt.js'
import { commentId, validateCommentMessage } from './validate.js'

/** Agent replies retain their normal ACP file/permission authority. */
export interface CommentAgentReply {
  /** Plain-text final reply. */
  text: string
  /** Agent-reported project edits. */
  changes?: { file: string, added: number, removed: number }[]
  /** Agent tool calls and thinking spans, settled. */
  steps?: UiAgentStep[]
}

/** Comment dispatcher starts one independent agent session for each comment. */
export type CommentAgentRunner<T extends UiAgentThreadBase = UiAiThread> = (comment: T, working: () => Promise<void>) => Promise<CommentAgentReply>

/** Client-writable fields every conversation draft carries. */
export interface ThreadDraftBase {
  /** Opaque UUID. */
  id: string
  /** Uploaded files referenced by the first message. */
  attachments?: UiCommentAttachment[]
}

/**
 * Status of a comment no agent is working on: `replied` when the latest message is a
 * successful agent answer, otherwise `draft` (unsent user reply, failure, or no reply yet).
 * @param comment Persisted comment.
 */
export function idleStatus(comment: UiAgentThreadBase): 'draft' | 'replied' {
  const last = comment.thread.at(-1)
  return last?.author === 'agent' && !last.failed ? 'replied' : 'draft'
}

/** Stores for the same project file share pending ownership, including resolved conversations. */
const deliveries = new Map<string, Set<string>>()
/** Each physical file retains bounded reply space while its agent is running. */
const replyReservations = new Map<string, Map<string, UiCommentMessage>>()

/**
 * Lazy persisted CRUD and ordered agent delivery, independent of browser transport.
 * Defaults store AI threads; `codec` and `validateDraft` adapt it to other conversations.
 */
export function createCommentsStore<T extends UiAgentThreadBase = UiAiThread, D extends ThreadDraftBase = AiThreadDraftInput>(options: {
  /** Captured project root. */
  root: string
  /** Trusted configured relative path. */
  file: string
  /** Disabled stores perform no filesystem access. */
  enabled: boolean
  /** Publication callback, shared by all dev clients. */
  changed?: (comments: T[]) => void
  /** Persisted record format; AI threads by default. */
  codec?: ThreadFileCodec<T>
  /** Project client-writable fields (server-derived fields may be added here). */
  validateDraft?: (value: unknown) => D
}) {
  const codec = options.codec ?? defaultCodec<T>()
  const validateDraft = options.validateDraft ?? (validateAiThreadDraft as unknown as (value: unknown) => D)
  let queue: Promise<unknown> = Promise.resolve()
  let closed = false
  /** A pending reply retains its reserved slot even if resolution changes visible status. */
  function isPending(id: string, fileKey: string): boolean {
    return deliveries.get(fileKey)?.has(id) ?? false
  }
  /** Pending reservations belong to real files, so aliases cannot spend them twice. */
  function reservedReplies(fileKey: string): Map<string, UiCommentMessage> {
    let value = replyReservations.get(fileKey)
    if (!value) {
      value = new Map()
      replyReservations.set(fileKey, value)
    }
    return value
  }
  /** Remove a completed reservation only after its replacement write persisted. */
  function releaseReplyReservation(fileKey: string, id: string) {
    const value = replyReservations.get(fileKey)
    if (!value) return
    value.delete(id)
    if (!value.size) replyReservations.delete(fileKey)
  }
  /** Every write includes in-flight reply bytes before it can consume shared headroom. */
  function assertReservedFileCapacity(comments: T[], fileKey: string, replacing?: string) {
    const reservations = replyReservations.get(fileKey)
    if (!reservations?.size) return
    const projected = comments.map((comment) => {
      const reply = comment.id === replacing ? undefined : reservations.get(comment.id)
      return reply ? { ...comment, thread: [...comment.thread, reply] } : comment
    })
    if (commentsFileBytes(projected, codec) > COMMENT_FILE_BYTE_LIMIT) throw new CommentCapacityError()
  }
  /** Disabled/static callers cannot read project comments. */
  async function list(): Promise<T[]> {
    return options.enabled ? readCommentsFile(options.root, options.file, codec) : []
  }
  /**
   * Every mutation re-reads within the common file lane, preventing lost drafts.
   * `released` lists attachment paths the edit may have dropped; those no record still
   * references are deleted after the write, inside the same lock, so a concurrent
   * mutation cannot re-reference a file between the check and the unlink.
   */
  async function mutate(edit: (comments: T[], fileKey: string) => T[], mutation: { replacing?: string, committed?: (fileKey: string) => void, released?: () => readonly string[] } = {}): Promise<T[]> {
    if (!options.enabled || closed) throw new Error('Comments are disabled')
    const comments = await withCommentsFileLock(options.root, options.file, async (fileKey) => {
      const value = edit(await list(), fileKey).map(codec.validate)
      if (closed) throw new Error('Comments are disabled')
      assertReservedFileCapacity(value, fileKey, mutation.replacing)
      await writeCommentsFile(options.root, options.file, value, codec)
      mutation.committed?.(fileKey)
      const released = mutation.released?.() ?? []
      if (released.length) {
        const kept = new Set(value.flatMap(comment => commentAttachments(comment).map(file => file.path)))
        await removeAttachments(options.root, released.filter(path => !kept.has(path)))
      }
      return value
    })
    if (!closed) options.changed?.(comments)
    return comments
  }
  /** Targeted mutations preserve unrelated comments and exact reply ownership. */
  async function change(id: string, edit: (comment: T, fileKey: string) => T, options?: { replacing?: string, committed?: (fileKey: string) => void }): Promise<void> {
    commentId(id)
    await mutate((comments, fileKey) => {
      if (!comments.some(comment => comment.id === id)) throw new Error('Comment no longer exists')
      return comments.map(comment => comment.id === id ? { ...edit(comment, fileKey), updatedAt: new Date().toISOString() } : comment)
    }, options)
  }
  return { list,
    /** A new dev generation cannot inherit an agent process from persisted lifecycle. */
    async recover(): Promise<void> {
      if (!options.enabled || closed) return
      await withCommentsFileLock(options.root, options.file, async (fileKey) => {
        const comments = await list()
        if (closed) return
        // Interrupted work and older reopened threads (saved as `draft` after an agent reply) get their idle status.
        const stale = (comment: T) => ['sent', 'working'].includes(comment.status) || (comment.status === 'draft' && idleStatus(comment) === 'replied')
        if (!comments.some(stale)) return
        const recovered = comments.map(comment => stale(comment) ? { ...comment, status: idleStatus(comment), updatedAt: new Date().toISOString() } : comment)
        assertReservedFileCapacity(recovered, fileKey)
        await writeCommentsFile(options.root, options.file, recovered, codec)
        if (!closed) options.changed?.(recovered)
      })
    },
    /** Create/update user fields while retaining server-owned lifecycle and thread. */
    async upsert(value: D): Promise<void> {
      const input = validateDraft(value)
      let detached: string[] = []
      await mutate((comments, fileKey) => {
        const previous = comments.find(comment => comment.id === input.id)
        detached = (previous?.attachments ?? []).map(file => file.path)
        if (isPending(input.id, fileKey) || previous?.status === 'sent' || previous?.status === 'working') throw new Error('Cannot edit comment while agent is working')
        const now = new Date().toISOString()
        const comment = { ...previous, ...input, status: previous?.status ?? 'draft', thread: previous?.thread ?? [], createdAt: previous?.createdAt ?? now, updatedAt: now }
        return previous ? comments.map(value => value.id === input.id ? comment as T : value) : [...comments, comment as T]
      }, { released: () => detached })
    },
    /** Remove only the explicitly named persisted annotation. */
    async remove(id: string): Promise<void> {
      commentId(id)
      let removed: T | undefined
      await mutate((comments, fileKey) => {
        if (isPending(id, fileKey)) throw new Error('Cannot remove comment while agent is working')
        removed = comments.find(comment => comment.id === id)
        return comments.filter(comment => comment.id !== id)
      }, { released: () => removed ? commentAttachments(removed).map(file => file.path) : [] })
    },
    /** Resolve/reopen preserves history and never restarts agent work. */
    resolve(id: string, resolved: boolean): Promise<void> {
      return change(id, comment => ({ ...comment, status: resolved ? 'resolved' : idleStatus(comment) }))
    },
    /** Replies reopen resolved threads and enter the same independent conversation on its next send. */
    reply(id: string, body: string, attachments?: UiCommentAttachment[]): Promise<void> {
      const message = validateCommentMessage({ author: 'user', body, at: new Date().toISOString(), ...(attachments?.length ? { attachments } : {}) })
      return change(id, (comment, fileKey) => {
        if (isPending(id, fileKey) || ['sent', 'working'].includes(comment.status)) throw new Error('Cannot reply while agent is working')
        return { ...comment, thread: [...comment.thread, message], status: 'draft' }
      })
    },
    /** Ordered bulk delivery shares no agent session or positional identity between comments; `sessionOptions` persist on each comment. */
    async send(ids: readonly string[], agentId: string, runner: CommentAgentRunner<T>, sessionOptions?: UiCommentSessionOptions): Promise<void> {
      if (!options.enabled || closed) throw new Error('Comments are disabled')
      if (!ids.length || ids.length > 100 || typeof agentId !== 'string' || !agentId.trim() || agentId.length > 128) throw new Error('Invalid comment send')
      const fileKey = await commentsFileIdentity(options.root, options.file)
      if (closed) throw new Error('Comments are disabled')
      const targets = [...new Set(ids.map(commentId))].filter(id => !isPending(id, fileKey))
      const admitted = deliveries.get(fileKey) ?? new Set<string>()
      if (targets.length) deliveries.set(fileKey, admitted)
      for (const id of targets) admitted.add(id)
      const operation = queue.catch(() => {}).then(async () => {
        for (const id of targets) {
          if (closed) break
          const comment = (await list()).find(value => value.id === id)
          if (!comment || !['draft', 'replied'].includes(comment.status)) continue
          let acquired = false
          let reservation: UiCommentMessage | undefined
          await mutate((comments, currentFileKey) => {
            const value = comments.find(comment => comment.id === id)
            if (!value || !['draft', 'replied'].includes(value.status)) return comments
            reservation = reserveCommentFileReplyCapacity(comments, value, agentId, reservedReplies(currentFileKey), codec)
            acquired = true
            return comments.map(comment => comment.id === id ? { ...comment, status: 'sent' as const, agentId, ...(sessionOptions ? { options: sessionOptions } : {}), updatedAt: new Date().toISOString() } : comment)
          }, { committed: (currentFileKey) => {
            if (reservation) reservedReplies(currentFileKey).set(id, reservation)
          } })
          if (!acquired) continue
          let result: CommentAgentReply
          try {
            result = await runner({ ...comment, agentId, ...(sessionOptions ? { options: sessionOptions } : {}) }, () => change(id, value => ({ ...value, status: value.status === 'resolved' ? 'resolved' : 'working' })))
          }
          catch {
            try {
              await change(id, value => ({ ...value, status: value.status === 'resolved' ? 'resolved' : 'draft', thread: [...value.thread, { author: 'agent', agentId, body: 'Agent request failed. Retry after checking the agent.', at: new Date().toISOString(), failed: true }] }), { replacing: id, committed: currentFileKey => releaseReplyReservation(currentFileKey, id) })
            }
            catch {
              // Lifecycle recovery never requires a second available message slot.
              await change(id, value => ({ ...value, status: value.status === 'resolved' ? 'resolved' : 'draft' }), { replacing: id, committed: currentFileKey => releaseReplyReservation(currentFileKey, id) })
            }
            continue
          }
          try {
            const message = boundedCommentAgentReply(result, agentId)
            await change(id, value => ({ ...value, status: value.status === 'resolved' ? 'resolved' : 'replied', thread: [...value.thread, message] }), { replacing: id, committed: currentFileKey => releaseReplyReservation(currentFileKey, id) })
          }
          catch (failure) {
            // Never replace a completed reply with an empty terminal thread.
            throw new CommentReplyStorageError(failure)
          }
        }
      }).finally(() => {
        for (const id of targets) {
          admitted.delete(id)
          releaseReplyReservation(fileKey, id)
        }
        if (!admitted.size && deliveries.get(fileKey) === admitted) deliveries.delete(fileKey)
      })
      queue = operation
      return operation
    },
    /** Stop admissions before channel/ACP cleanup observes pending delivery. */
    async close(): Promise<void> {
      closed = true
      // Admission/delivery errors already belong to each send caller; cleanup
      // waits for settlement without repeating a completed action failure.
      await queue.catch(() => {})
    } }
}
