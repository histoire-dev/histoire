import type { UiAiThread, UiAiThreadsSnapshot } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { PromptFile } from '../../acp/prompt-blocks.js'
import type { AcpPromptContext } from '../../acp/types.js'
import type { CommentAgentReply } from '../../comments/store.js'
import type { Context } from '../../context.js'
import type { UiChannelClient, UiChannelServer } from './types.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { isPinnedThread } from '@histoire/shared'
import { CommentsMigrationError, migrateComments } from '../../ai-threads/migrate-comments.js'
import { aiProjectContext } from '../../ai-threads/project-context.js'
import { aiThreadContext, aiThreadPrompt, commentAgentContext, commentPrompt } from '../../ai-threads/prompt.js'
import { aiThreadsCodec, THREADS_FILE, validateAiThreadDraft } from '../../ai-threads/validate.js'
import { sweepAttachments } from '../../comments/attachments-sweep.js'
import { attachmentExists } from '../../comments/attachments.js'
import { CommentCapacityError, CommentReplyStorageError } from '../../comments/capacity.js'
import { createProjectFileIndex } from '../../comments/files-search.js'
import { commentPromptFiles, isCommentCommand } from '../../comments/prompt.js'
import { createCommentsStore } from '../../comments/store.js'
import { commentId, validateCommentAttachments, validateCommentOptions } from '../../comments/validate.js'
import { assertThreadTarget, threadStoryFile } from './ai-threads-target.js'
import { registerCommentsHttp } from './comments-http.js'

/** Narrow ACP bridge; the ACP manager satisfies it. */
export interface AiThreadsAgentBridge {
  /** Start/reuse one configured agent session for one thread. */
  prompt: (input: { agentId: string, threadId: string, text: string, context?: AcpPromptContext, command?: boolean, files?: PromptFile[], options?: UiAiThread['options'] }) => Promise<CommentAgentReply>
  /** Cancel this thread conversation during dev generation cleanup. */
  cancel: (threadId: string) => void | Promise<void>
  /** Slash command names the agent announced; without it nothing counts as a command. */
  commandNames?: (agentId: string) => string[]
}

/**
 * Split snapshots without truncating threads or exceeding the shared 64 KB envelope.
 * @param threads Persisted threads.
 * @param enabled Feature availability.
 * @param error Controlled failure notice.
 * @param requestId Request owning the failure.
 * @param pinsEnabled Canvas pins availability; follows `enabled` by default.
 */
export function aiThreadsSnapshotParts(threads: UiAiThread[], enabled: boolean, error?: string, requestId?: string, pinsEnabled = enabled): UiAiThreadsSnapshot[] {
  const parts: UiAiThread[][] = [[]]
  for (const thread of threads) {
    const current = parts[parts.length - 1]
    if (current.length && Buffer.byteLength(JSON.stringify([...current, thread])) > 56 * 1024) parts.push([thread])
    else current.push(thread)
  }
  const revision = randomUUID()
  return parts.map((threads, part) => ({ enabled, pinsEnabled, threads, revision, part, total: parts.length, error, requestId }))
}

/**
 * Register development-only conversations persisted in `.histoire/threads.json`: free-form
 * AI threads and pinned threads (canvas comments), with their file search and upload routes.
 * Legacy `comments.json` content is imported once before the first snapshot.
 * @param ctx Dev context.
 * @param channel UI channel.
 * @param agents ACP bridge.
 * @param isActive Generation ownership.
 * @param server Vite dev server mounting the comments HTTP routes.
 */
export function registerAiThreadsChannel(ctx: Context, channel: UiChannelServer, agents?: AiThreadsAgentBridge, isActive: () => boolean = () => true, server?: ViteDevServer) {
  const enabled = ctx.mode === 'dev'
  const pinsEnabled = enabled && ctx.config.comments?.enabled !== false
  let closed = false
  /** Controlled import failure shown with every ready snapshot; threads stay usable. */
  let migrationNotice: string | undefined
  const running = new Set<string>()
  /** Publish complete snapshots to one client or all. */
  function send(threads: UiAiThread[], client?: UiChannelClient, error?: string, requestId?: string) {
    if (!closed && isActive()) {
      for (const part of aiThreadsSnapshotParts(threads, enabled, error, requestId, pinsEnabled)) channel.send('histoire:ui:ai-threads-snapshot', part, client)
    }
  }
  const store = createCommentsStore({ root: ctx.root, file: THREADS_FILE, enabled, codec: aiThreadsCodec, validateDraft: validateAiThreadDraft, changed: threads => send(threads) })
  const index = createProjectFileIndex(ctx.root)
  if (server && enabled) channel.addCleanup(registerCommentsHttp(ctx, server, index, () => !closed && isActive()))
  // Import before recovery, so interrupted legacy work also returns to its idle status.
  const migrated = pinsEnabled
    ? migrateComments(ctx.root, ctx.config.comments?.file ?? '.histoire/comments.json').then(() => {}, (error) => {
        migrationNotice = error instanceof CommentsMigrationError ? error.message : 'Canvas comments could not be imported; original file preserved.'
      })
    : Promise.resolve()
  const ready = migrated.then(() => store.recover())
  // Observe failures immediately; each explicit ready/request still receives the controlled notice.
  void ready.catch(() => {})
  // Uploads whose message was never saved are dropped once the threads file is readable.
  if (enabled) void ready.then(() => sweepAttachments(ctx.root, [{ file: THREADS_FILE, codec: aiThreadsCodec }])).catch(() => {})
  /** Referenced uploads must exist; the browser cannot point at arbitrary files. */
  async function assertAttachments(attachments: UiAiThread['attachments']) {
    for (const attachment of attachments ?? []) {
      if (!(await attachmentExists(ctx.root, attachment))) throw new Error('AI thread attachment unavailable')
    }
  }
  /** Shape, pin availability, collected target and uploads of a client draft. */
  async function validateDraft(value: unknown) {
    const draft = validateAiThreadDraft(value)
    if (draft.anchor && !pinsEnabled) throw new Error('Canvas comments are disabled')
    await assertThreadTarget(ctx, draft)
    await assertAttachments(draft.attachments)
    return draft
  }
  /** Uploads and `@` mentions of the conversation; earlier messages' files are flagged. */
  async function promptFiles(thread: UiAiThread): Promise<PromptFile[]> {
    return commentPromptFiles(thread, new Set(await index.files().catch(() => [])))
  }
  /** Controlled failure labels avoid publishing filesystem or agent error internals. */
  async function failed(client: UiChannelClient, error?: unknown, requestId?: string) {
    const notice = error instanceof CommentCapacityError || error instanceof CommentReplyStorageError ? error.message : 'AI thread action failed. Reload and retry.'
    send(await store.list().catch(() => []), client, notice, requestId)
  }
  /** Feature errors are handled before the channel's generic envelope guard. */
  function handle(event: `histoire:ui:${string}`, work: (value: any) => Promise<unknown>) {
    channel.on(event, value => value, async (value, client) => {
      if (!enabled || closed || !isActive()) return
      let id: string | undefined
      try {
        const request = (value as { requestId?: unknown } | undefined)?.requestId
        id = request === undefined ? undefined : commentId(request)
        await ready
        await work(value)
      }
      catch (error) { await failed(client, error, id) }
    })
  }
  /** Agent task text and structured context: canvas wording for pinned threads. */
  function agentRequest(thread: UiAiThread, commands: readonly string[]) {
    if (isPinnedThread(thread)) {
      // Dispatch still needs a collected target; orphan pins stay stored but cannot run.
      const file = threadStoryFile(ctx, thread)!
      return { text: commentPrompt(thread, commands), context: commentAgentContext(thread, file.relativePath) }
    }
    return { text: aiThreadPrompt(thread, aiProjectContext(ctx), commands), context: aiThreadContext(thread, ctx) }
  }
  /** Each thread keeps its own agent conversation. */
  async function dispatch(id: string, agentId: string, options?: UiAiThread['options']) {
    if (!agents) throw new Error('Agent unavailable')
    await store.send([id], agentId, async (thread, working) => {
      const commands = agents.commandNames?.(agentId) ?? []
      const request = agentRequest(thread, commands)
      running.add(thread.id)
      try {
        await working()
        return await agents.prompt({ agentId, threadId: thread.id, ...request, command: isCommentCommand(thread, commands), files: await promptFiles(thread), options: thread.options })
      }
      finally { running.delete(thread.id) }
    }, options)
  }
  channel.onReady(client => void ready.then(() => store.list()).then(threads => send(threads, client, migrationNotice)).catch(() => failed(client)))
  handle('histoire:ui:ai-thread-save', async value => store.upsert(await validateDraft(value?.draft)))
  handle('histoire:ui:ai-thread-create', async (value) => {
    if (typeof value?.agentId !== 'string' || !value.agentId) throw new Error('Invalid AI thread agent')
    const draft = await validateDraft(value.draft)
    await store.upsert(draft)
    await dispatch(draft.id, value.agentId, validateCommentOptions(value.options))
  })
  handle('histoire:ui:ai-thread-reply', async (value) => {
    const id = commentId(value?.id)
    const attachments = validateCommentAttachments(value?.attachments)
    await assertAttachments(attachments)
    await store.reply(id, value?.body, attachments)
    const thread = (await store.list()).find(thread => thread.id === id)
    // Threads keep their agent; a thread whose first send failed uses the client choice.
    const agentId = thread?.agentId ?? (typeof value?.agentId === 'string' && value.agentId ? value.agentId : undefined)
    if (agentId) await dispatch(id, agentId, validateCommentOptions(value?.options))
  })
  handle('histoire:ui:ai-thread-archive', async (value) => {
    if (typeof value?.archived !== 'boolean') throw new Error('Invalid AI thread archive')
    await store.resolve(commentId(value.id), value.archived)
  })
  handle('histoire:ui:ai-thread-delete', async value => store.remove(commentId(value?.id)))
  channel.addCleanup(async () => {
    closed = true
    await Promise.allSettled([...running].map(id => agents?.cancel(id)))
    await store.close()
  })
  return store
}
