import type { UiComment } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { COMMENT_FILE_BYTE_LIMIT } from './limits.js'
import { validateComment } from './validate.js'

/** All stores for the same real project path share one mutation lane. */
const queues = new Map<string, Promise<unknown>>()

/** Resolve each parent without traversing a symlink or escaping the real project. */
async function checkedFile(root: string, file: string, create: boolean): Promise<string | undefined> {
  const realRoot = await realpath(root)
  const relative = path.relative(path.resolve(root), path.resolve(root, file))
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Comments file must stay inside project')
  const segments = relative.split('/')
  let current = realRoot
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index])
    let entry = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    const final = index === segments.length - 1
    if (!entry && !final && create) {
      await mkdir(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
      entry = await lstat(current)
    }
    if (!entry && !create) return undefined
    if (entry && (entry.isSymbolicLink() || (final ? !entry.isFile() : !entry.isDirectory()))) throw new Error('Comments path cannot contain symlinks or non-regular files')
  }
  return current
}

/** Read only bounded versioned JSON; missing directories remain uncreated. */
export async function readCommentsFile(root: string, file: string): Promise<UiComment[]> {
  const checked = await checkedFile(root, file, false)
  if (!checked) return []
  if ((await lstat(checked)).size > COMMENT_FILE_BYTE_LIMIT) throw new Error('Comments file exceeds 2 MB')
  const data = JSON.parse(await readFile(checked, 'utf8'))
  if (data?.version !== 1 || !Array.isArray(data.comments)) throw new Error('Invalid comments file; original file preserved')
  return data.comments.map(validateComment)
}

/** Use one serializer for persisted writes and admission calculations. */
function commentsFileContent(comments: readonly UiComment[]): string {
  return `${JSON.stringify({ version: 1, comments: comments.map(validateComment) }, null, 2)}\n`
}

/** Report exact on-disk UTF-8 bytes, including pretty-printing and final newline. */
export function commentsFileBytes(comments: readonly UiComment[]): number {
  return Buffer.byteLength(commentsFileContent(comments))
}

/** Rename a private sibling after successful serialization, preserving original on failure. */
export async function writeCommentsFile(root: string, file: string, comments: readonly UiComment[]): Promise<void> {
  const content = commentsFileContent(comments)
  if (Buffer.byteLength(content) > COMMENT_FILE_BYTE_LIMIT) throw new Error('Comments file exceeds 2 MB')
  const checked = (await checkedFile(root, file, true))!
  const temporary = `${checked}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
    await rename(temporary, checked)
  }
  finally { await rm(temporary, { force: true }) }
}

/** Physical project identity is shared by mutation lanes and pending reply reservations. */
export async function commentsFileIdentity(root: string, file: string): Promise<string> {
  const relative = path.relative(path.resolve(root), path.resolve(root, file))
  return path.resolve(await realpath(root), relative)
}

/** Read/modify/write ownership spans all clients and store instances for one physical file. */
export async function withCommentsFileLock<T>(root: string, file: string, work: (key: string) => Promise<T>): Promise<T> {
  const key = await commentsFileIdentity(root, file)
  const previous = queues.get(key) ?? Promise.resolve()
  const operation = previous.catch(() => {}).then(() => work(key))
  queues.set(key, operation)
  try {
    return await operation
  }
  finally {
    if (queues.get(key) === operation) queues.delete(key)
  }
}
