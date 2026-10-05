import type { UiComment, UiCommentsSnapshot } from '@histoire/shared'
import type { CommentAgentReply } from '../../comments/store.js'
import type { Context } from '../../context.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { CommentCapacityError, CommentReplyStorageError } from '../../comments/capacity.js'
import { commentAgentContext, commentPrompt } from '../../comments/prompt.js'
import { createCommentsStore } from '../../comments/store.js'
import { commentId, validateCommentDraft } from '../../comments/validate.js'
import { listScreenshotFiles } from './files.js'

/** Narrow ACP bridge keeps comments independent from agent process ownership. */
export interface CommentsAgentBridge {
  /** Start/reuse one configured agent session for one comment. */
  prompt: (input: { agentId: string, threadId: string, text: string, context: ReturnType<typeof commentAgentContext> }) => Promise<CommentAgentReply>
  /** Cancel this comment conversation during dev generation cleanup. */
  cancel: (threadId: string) => void | Promise<void>
}

/** Split snapshots without truncating threads or exceeding the shared 64 KB envelope. */
export function commentsSnapshotParts(comments: UiComment[], enabled: boolean, error?: string, requestId?: string): UiCommentsSnapshot[] {
  const parts: UiComment[][] = [[]]
  for (const comment of comments) {
    const current = parts[parts.length - 1]
    if (current.length && Buffer.byteLength(JSON.stringify([...current, comment])) > 56 * 1024) parts.push([comment])
    else current.push(comment)
  }
  const revision = randomUUID()
  return parts.map((comments, part) => ({ enabled, comments, revision, part, total: parts.length, error, requestId }))
}

/** Register development-only CRUD and ordered ACP delivery on the captured UI channel. */
export function registerCommentsChannel(ctx: Context, channel: UiChannelServer, agents?: CommentsAgentBridge, isActive: () => boolean = () => true) {
  const enabled = ctx.mode === 'dev' && ctx.config.comments?.enabled !== false
  let closed = false
  const running = new Set<string>()
  /** Active snapshots never reveal agent commands, absolute paths, or environment. */
  function send(comments: UiComment[], client?: UiChannelClient, error?: string, requestId?: string) {
    if (!closed && isActive()) {
      for (const part of commentsSnapshotParts(comments, enabled, error, requestId)) channel.send('histoire:ui:comments-snapshot', part, client)
    }
  }
  const store = createCommentsStore({ root: ctx.root, file: ctx.config.comments?.file ?? '.histoire/comments.json', enabled, changed: comments => send(comments) })
  const ready = store.recover()
  // Observe failures immediately; each explicit ready/request still receives
  // the controlled storage notice instead of hiding an invalid comments file.
  void ready.catch(() => {})
  /** Admission checks only collected targets; orphan comments stay stored but cannot run. */
  async function validateTarget(value: unknown) {
    const draft = validateCommentDraft(value)
    const file = ctx.storyFiles.find(file => file.story?.id === draft.storyId)
    if (!file?.story || file.story.docsOnly || !file.story.variants.some(variant => variant.id === draft.variantId)) throw new Error('Comment target unavailable')
    if (draft.screenshot && !(await listScreenshotFiles(ctx.root)).some(file => file.path === draft.screenshot && file.storyId === draft.storyId && file.variantId === draft.variantId)) throw new Error('Comment screenshot unavailable')
    return draft
  }
  /** Controlled failure labels avoid publishing filesystem or agent error internals. */
  async function failed(client: UiChannelClient, error?: unknown, requestId?: string) {
    const notice = error instanceof CommentCapacityError || error instanceof CommentReplyStorageError
      ? error.message
      : 'Comment action failed. Reload comments and retry.'
    send(await store.list().catch(() => []), client, notice, requestId)
  }
  /** Reject malformed correlation IDs without trusting arbitrary client strings. */
  function requestId(value: unknown): string | undefined {
    const id = (value as { requestId?: unknown } | undefined)?.requestId
    if (id === undefined) return undefined
    return commentId(id)
  }
  /** Feature errors are handled before the channel's generic envelope guard. */
  function handle(event: `histoire:ui:${string}`, work: (value: any) => Promise<unknown>) {
    channel.on(event, value => value, async (value, client) => {
      if (!enabled || closed || !isActive()) return
      let id: string | undefined
      try {
        id = requestId(value)
        await ready
        await work(value)
      }
      catch (error) { await failed(client, error, id) }
    })
  }
  channel.onReady(client => void ready.then(() => store.list()).then(comments => send(comments, client)).catch(() => failed(client)))
  handle('histoire:ui:comment-upsert', async value => store.upsert(await validateTarget(value)))
  handle('histoire:ui:comment-delete', async value => store.remove(commentId(value?.id)))
  handle('histoire:ui:comment-resolve', async (value) => {
    if (typeof value?.resolved !== 'boolean') throw new Error('Invalid comment resolution')
    await store.resolve(commentId(value.id), value.resolved)
  })
  /** Every comment keeps a separate agent conversation and collected file context. */
  async function dispatch(ids: string[], agentId: string) {
    // ACP merges project and user-level presets. The manager owns catalog and
    // enabled-policy validation; comments cannot infer that authority from config.
    if (!agents) throw new Error('Agent unavailable')
    await store.send(ids, agentId, async (comment, working) => {
      const file = ctx.storyFiles.find(file => file.story?.id === comment.storyId)
      if (!file?.story || !file.story.variants.some(variant => variant.id === comment.variantId)) throw new Error('Comment target unavailable')
      running.add(comment.id)
      try {
        await working()
        return await agents.prompt({ agentId, threadId: comment.id, text: commentPrompt(comment), context: commentAgentContext(comment, file.relativePath) })
      }
      finally { running.delete(comment.id) }
    })
  }
  handle('histoire:ui:comment-reply', async (value) => {
    const id = commentId(value?.id)
    await store.reply(id, value?.body)
    const comment = (await store.list()).find(comment => comment.id === id)
    if (comment?.agentId) await dispatch([id], comment.agentId)
  })
  handle('histoire:ui:comment-send', async (value) => {
    if (!Array.isArray(value?.ids)) throw new Error('Invalid comment send')
    if (value.draft) await store.upsert(await validateTarget(value.draft))
    await dispatch(value.ids, value.agentId)
  })
  channel.addCleanup(async () => {
    closed = true
    await Promise.allSettled([...running].map(id => agents?.cancel(id)))
    await store.close()
  })
  return store
}
