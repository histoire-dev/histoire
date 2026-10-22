import type { UiAgentThreadBase } from '@histoire/shared'
import type { ThreadFileCodec } from './file.js'
import { lstat, readdir, unlink } from 'node:fs/promises'
import { join } from 'pathe'
import { projectDirectory } from '../util/project-directory.js'
import { attachmentName } from './attachments.js'
import { readCommentsFile, withCommentsFileLock } from './file.js'
import { commentAttachments } from './prompt.js'

/** Uploads younger than this may still be waiting in an open composer. */
export const ORPHAN_ATTACHMENT_AGE = 60 * 60 * 1000

/** One persisted conversation file whose records may reference uploads. */
export interface AttachmentSource {
  /** Project-relative file path. */
  file: string
  /** Record format of that file. */
  codec: ThreadFileCodec<UiAgentThreadBase>
}

/**
 * Runs `work` while holding every source file lock, acquired in the given order.
 * @param root Project root.
 * @param sources Conversation files.
 * @param work Callback run under all locks.
 */
function withLocks<R>(root: string, sources: readonly AttachmentSource[], work: () => Promise<R>): Promise<R> {
  const [first, ...rest] = sources
  return first ? withCommentsFileLock(root, first.file, () => withLocks(root, rest, work)) : work()
}

/**
 * Deletes generated uploads that no conversation references and that are older than `maxAge`,
 * i.e. files uploaded from a composer whose message was never saved.
 * Only regular files with generated names are touched; symlinks and the symlinked folder are refused.
 * Any unreadable source aborts the sweep, so a corrupt file never causes data loss.
 * @param root Project root.
 * @param sources Every conversation file sharing `.histoire/attachments`.
 * @param maxAge Minimum age in milliseconds.
 * @param now Current time in milliseconds.
 * @returns Deleted stored names.
 */
export async function sweepAttachments(root: string, sources: readonly AttachmentSource[], maxAge = ORPHAN_ATTACHMENT_AGE, now = Date.now()): Promise<string[]> {
  return withLocks(root, sources, async () => {
    const directory = await projectDirectory(root, ['.histoire', 'attachments'], false)
    if (!directory) return []
    const referenced = new Set<string>()
    for (const { file, codec } of sources) {
      for (const record of await readCommentsFile(root, file, codec)) {
        for (const attachment of commentAttachments(record)) referenced.add(attachment.path)
      }
    }
    const removed: string[] = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `.histoire/attachments/${entry.name}`
      if (!entry.isFile() || !attachmentName(path) || referenced.has(path)) continue
      // lstat never follows a symlink swapped in after readdir.
      const stats = await lstat(join(directory, entry.name)).catch(() => undefined)
      if (!stats?.isFile() || now - stats.mtimeMs < maxAge) continue
      await unlink(join(directory, entry.name)).then(() => removed.push(entry.name), () => {})
    }
    return removed
  })
}
