import type { UiAiThread } from '@histoire/shared'
import type { ThreadFileCodec } from '../comments/file.js'
import { lstat, rename } from 'node:fs/promises'
import path from 'pathe'
import { commentsFileIdentity, readCommentsFile, withCommentsFileLock, writeCommentsFile } from '../comments/file.js'
import { aiThreadsCodec, THREADS_FILE, validateAiThread } from './validate.js'

/** Controlled notice: a legacy comments file stays in place when it cannot be imported. */
export class CommentsMigrationError extends Error {
  /**
   * @param file Configured project-relative source.
   * @param cause Read or validation failure.
   */
  constructor(file: string, cause?: unknown) {
    super(`Canvas comments in ${file} could not be imported; original file preserved.`, { cause })
    this.name = 'CommentsMigrationError'
  }
}

/**
 * Legacy record (top-level `storyId`/`variantId` beside the pin fields) as a pinned thread.
 * The thread validator derives the title from the body and checks every field.
 * @param value Persisted legacy comment.
 */
function legacyComment(value: unknown): UiAiThread {
  if (!value || typeof value !== 'object') throw new Error('Invalid legacy comment')
  const { storyId, variantId, ...rest } = value as Record<string, unknown>
  if (rest.anchor === undefined || variantId === undefined) throw new Error('Invalid legacy comment')
  return validateAiThread({ ...rest, context: { storyId, variantId } })
}

/** `{ version: 1, comments: [...] }` documents read through the shared bounded file layer. */
const legacyCommentsCodec: ThreadFileCodec<UiAiThread> = { key: 'comments', label: 'Comments', validate: legacyComment }

/**
 * Import legacy canvas comments into the threads file as pinned threads, then rename the
 * source to `<name>.migrated.json` beside it (a backup that also makes the import run once).
 * Ids already present in the threads file are skipped. Both files stay locked throughout.
 * @param root Project root.
 * @param source Configured project-relative comments file.
 * @param target Project-relative threads file.
 * @returns Number of imported threads.
 */
export async function migrateComments(root: string, source: string, target = THREADS_FILE): Promise<number> {
  return withCommentsFileLock(root, source, () => withCommentsFileLock(root, target, async () => {
    const absolute = await commentsFileIdentity(root, source)
    if (!(await lstat(absolute).catch(() => undefined))) return 0
    let comments: UiAiThread[]
    try {
      comments = await readCommentsFile(root, source, legacyCommentsCodec)
    }
    catch (error) { throw new CommentsMigrationError(source, error) }
    const threads = await readCommentsFile(root, target, aiThreadsCodec)
    const known = new Set(threads.map(thread => thread.id))
    const added = comments.filter(comment => !known.has(comment.id))
    if (added.length) await writeCommentsFile(root, target, [...threads, ...added], aiThreadsCodec)
    // Rename only after the threads write persisted, so a failure retries on next start.
    await rename(absolute, path.join(path.dirname(absolute), `${path.basename(absolute, '.json')}.migrated.json`))
    return added.length
  }))
}
