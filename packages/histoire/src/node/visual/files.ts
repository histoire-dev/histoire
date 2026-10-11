import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { closeSync, constants, fstatSync, openSync, readSync, renameSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { visualHash } from './identity.js'

/** Only ENOENT means absence; corruption and access failures stay observable. */
function absent(error: NodeJS.ErrnoException) {
  if (error.code !== 'ENOENT') {
    throw error
  }
  return undefined
}

/** Check every existing path segment; generated roots cannot cross symlinks. */
export async function safeVisualPath(root: string, relative: string, create = false): Promise<string> {
  const canonical = await realpath(root)
  if (!relative || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid visual file path')
  }
  const destination = resolve(canonical, relative)
  if (!destination.startsWith(`${canonical}${sep}`)) {
    throw new Error('Visual file must stay inside project')
  }
  let path = canonical
  const segments = relative.split('/')
  for (let index = 0; index < segments.length; index++) {
    path = join(path, segments[index])
    let entry = await lstat(path).catch(absent)
    if (!entry && create && index < segments.length - 1) {
      await mkdir(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') {
          throw error
        }
      })
      entry = await lstat(path)
    }
    if (entry?.isSymbolicLink() || (entry && index < segments.length - 1 && !entry.isDirectory())) {
      throw new Error('Visual file path cannot contain symlinks or non-directories')
    }
  }
  return destination
}

/** Read only bounded regular files without treating malformed paths as absence. */
export async function safeVisualRead(root: string, relative: string, maxBytes = 4 * 1024 * 1024): Promise<Buffer | undefined> {
  const path = await safeVisualPath(root, relative)
  const entry = await lstat(path).catch(absent)
  if (!entry) {
    return
  }
  if (!entry.isFile() || entry.size > maxBytes) {
    throw new Error('Invalid or oversized visual file')
  }
  const bytes = await readFile(path)
  if (bytes.byteLength > maxBytes) {
    throw new Error('Visual file exceeds limit')
  }
  return bytes
}

/** Private temporary copy awaiting atomic publication at its validated destination. */
export interface VisualStagedWrite {
  /** Canonical destination inside project. */
  path: string
  /** Sibling temporary file, renamed over destination on publication. */
  temporary: string
}

/** Write privately next to destination; caller must publish or discard staged file. */
export async function stageVisualWrite(root: string, relative: string, bytes: Uint8Array | string): Promise<VisualStagedWrite> {
  const path = await safeVisualPath(root, relative, true)
  const staged = { path, temporary: join(dirname(path), `.${randomUUID()}.tmp`) }
  try {
    await writeFile(staged.temporary, bytes, { flag: 'wx' })
    await safeVisualPath(root, relative)
  }
  catch (error) {
    await discardVisualStagedWrite(staged)
    throw error
  }
  return staged
}

/** Synchronous rename lets callers publish many files right after one synchronous fence. */
export function publishVisualStagedWrite(staged: VisualStagedWrite): void {
  renameSync(staged.temporary, staged.path)
}

/** Remove unpublished temporary file; published files are already gone from temporary path. */
export async function discardVisualStagedWrite(staged: VisualStagedWrite): Promise<void> {
  await unlink(staged.temporary).catch(absent)
}

/** Write privately then atomically publish one metadata or image file. */
export async function safeVisualWrite(root: string, relative: string, bytes: Uint8Array | string, preparePublish?: (path: string) => Promise<() => void>): Promise<void> {
  const staged = await stageVisualWrite(root, relative, bytes)
  try {
    const guard = await preparePublish?.(staged.path)
    // No asynchronous work between final ownership/CAS fence and rename dispatch.
    guard?.()
    await rename(staged.temporary, staged.path)
  }
  finally {
    await discardVisualStagedWrite(staged)
  }
}

/** Bounded synchronous read only for final publication fences on already validated paths. */
export function readVisualPublicationFile(path: string, maxBytes = 64 * 1024): Buffer | undefined {
  let descriptor: number
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  }
  catch (error) {
    return absent(error as NodeJS.ErrnoException)
  }
  try {
    const entry = fstatSync(descriptor)
    if (!entry.isFile() || entry.size > maxBytes) throw new Error('Invalid or oversized visual metadata')
    // Allocate for actual file, not 8 MiB limit for every tiny dependency in a fence.
    // Extra byte detects a file growing after fstat; changed contents still fail hash.
    const bytes = Buffer.alloc(entry.size + 1)
    let length = 0
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null)
      if (!count) break
      length += count
    }
    if (length > entry.size || length > maxBytes) throw new Error('Visual metadata changed during read')
    return bytes.subarray(0, length)
  }
  finally {
    closeSync(descriptor)
  }
}

/** List safe directory inventory; absent directory yields no saved cases. */
export async function listVisualFiles(root: string, relative: string): Promise<string[]> {
  const path = await safeVisualPath(root, relative)
  return await readdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error
    }
    return []
  })
}

/** Delete one saved definition without deleting any baseline or image. */
export async function removeVisualFile(root: string, relative: string): Promise<void> {
  const path = await safeVisualPath(root, relative)
  await unlink(path).catch(absent)
}

/** Acquire exclusive cross-process write lock; contested or abandoned locks fail safely. */
export async function acquireVisualLock(root: string, identity: string): Promise<() => Promise<void>> {
  const relative = `.histoire/visual/locks/${visualHash(identity)}.lock`
  const path = await safeVisualPath(root, relative, true)
  try {
    await writeFile(path, JSON.stringify({ pid: process.pid, token: randomUUID() }), { flag: 'wx' })
  }
  catch (error) {
    throw new Error('Visual baseline is locked by another writer; retry after it completes', { cause: error })
  }
  return async () => {
    await unlink(path).catch(absent)
  }
}

/** Exclusive cross-process write lock held for one operation. */
export async function withVisualLock<T>(root: string, identity: string, operation: () => Promise<T>): Promise<T> {
  const release = await acquireVisualLock(root, identity)
  try {
    return await operation()
  }
  finally {
    await release()
  }
}
