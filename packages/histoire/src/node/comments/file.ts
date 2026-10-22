import type { UiAgentThreadBase, UiAiThread } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { aiThreadsCodec } from '../ai-threads/validate.js'
import { COMMENT_FILE_BYTE_LIMIT } from './limits.js'

/** Serialization of one kind of persisted agent conversation (comments, AI threads). */
export interface ThreadFileCodec<T extends UiAgentThreadBase> {
  /** Array property in the versioned JSON document. */
  key: string
  /** Capitalized label used in error messages. */
  label: string
  /** Validate one persisted record, throwing on corrupt data. */
  validate: (value: unknown) => T
}

/** AI threads codec as the default of generic helpers, which thread callers omit. */
export function defaultCodec<T extends UiAgentThreadBase>(): ThreadFileCodec<T> {
  return aiThreadsCodec as unknown as ThreadFileCodec<T>
}

/** All stores for the same real project path share one mutation lane. */
const queues = new Map<string, Promise<unknown>>()

/** Resolve each parent without traversing a symlink or escaping the real project. */
async function checkedFile(root: string, file: string, create: boolean, label: string): Promise<string | undefined> {
  const realRoot = await realpath(root)
  const relative = path.relative(path.resolve(root), path.resolve(root, file))
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`${label} file must stay inside project`)
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
    if (entry && (entry.isSymbolicLink() || (final ? !entry.isFile() : !entry.isDirectory()))) throw new Error(`${label} path cannot contain symlinks or non-regular files`)
  }
  return current
}

/** Read only bounded versioned JSON; missing directories remain uncreated. */
export async function readCommentsFile<T extends UiAgentThreadBase = UiAiThread>(root: string, file: string, codec = defaultCodec<T>()): Promise<T[]> {
  const checked = await checkedFile(root, file, false, codec.label)
  if (!checked) return []
  if ((await lstat(checked)).size > COMMENT_FILE_BYTE_LIMIT) throw new Error(`${codec.label} file exceeds 2 MB`)
  const data = JSON.parse(await readFile(checked, 'utf8'))
  if (data?.version !== 1 || !Array.isArray(data[codec.key])) throw new Error(`Invalid ${codec.label.toLowerCase()} file; original file preserved`)
  return data[codec.key].map(codec.validate)
}

/** Use one serializer for persisted writes and admission calculations. */
function commentsFileContent<T extends UiAgentThreadBase>(comments: readonly T[], codec: ThreadFileCodec<T>): string {
  return `${JSON.stringify({ version: 1, [codec.key]: comments.map(codec.validate) }, null, 2)}\n`
}

/** Report exact on-disk UTF-8 bytes, including pretty-printing and final newline. */
export function commentsFileBytes<T extends UiAgentThreadBase = UiAiThread>(comments: readonly T[], codec = defaultCodec<T>()): number {
  return Buffer.byteLength(commentsFileContent(comments, codec))
}

/** Rename a private sibling after successful serialization, preserving original on failure. */
export async function writeCommentsFile<T extends UiAgentThreadBase = UiAiThread>(root: string, file: string, comments: readonly T[], codec = defaultCodec<T>()): Promise<void> {
  const content = commentsFileContent(comments, codec)
  if (Buffer.byteLength(content) > COMMENT_FILE_BYTE_LIMIT) throw new Error(`${codec.label} file exceeds 2 MB`)
  const checked = (await checkedFile(root, file, true, codec.label))!
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
