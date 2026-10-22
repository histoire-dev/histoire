import type { UiCommentAttachment } from '@histoire/shared'
import { randomUUID } from 'node:crypto'
import { lstat, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'pathe'
import { projectDirectory } from '../util/project-directory.js'

/** Largest file accepted for one comment attachment. */
export const ATTACHMENT_BYTES = 10 * 1024 * 1024
/** Generated stored names: opaque UUID plus a sanitized original name. */
const STORED_NAME = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}-[\w.-]{1,80}$/
/** Text types kept as declared; anything else unverified becomes a binary download. */
const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
/** Image signatures; declared browser types are never trusted for images. */
const SIGNATURES: [type: string, bytes: number[], offset?: number][] = [
  ['image/png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  ['image/jpeg', [0xFF, 0xD8, 0xFF]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['image/webp', [0x57, 0x45, 0x42, 0x50], 8],
]

/** Attachments stay inside the real project root, never behind a symlink. */
function attachmentsDirectory(root: string, create: boolean) {
  return projectDirectory(root, ['.histoire', 'attachments'], create)
}

/**
 * Detects an image type from its leading bytes.
 * @param bytes File content.
 */
export function imageType(bytes: Uint8Array): string | undefined {
  return SIGNATURES.find(([, signature, offset = 0]) => signature.every((byte, index) => bytes[offset + index] === byte))?.[0]
}

/**
 * Builds the verified media type of stored content.
 * @param bytes File content.
 * @param declared Browser-provided type.
 */
function mediaType(bytes: Uint8Array, declared: string): string {
  return imageType(bytes) ?? (TEXT_TYPES.includes(declared) ? declared : 'application/octet-stream')
}

/**
 * Original display name without directories, bounded.
 * @param name Browser-provided file name.
 */
function displayName(name: string): string {
  return basename(name.replace(/\\/g, '/')).replace(/\p{Cc}/gu, '').slice(0, 200) || 'file'
}

/**
 * Filesystem-safe name fragment that keeps the extension.
 * @param name Display name.
 */
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(-80) || 'file'
}

/**
 * Stores one uploaded file beneath `.histoire/attachments` with an exclusive generated name.
 * @param root Project root.
 * @param name Browser-provided file name.
 * @param declared Browser-provided media type.
 * @param bytes File content.
 */
export async function saveAttachment(root: string, name: string, declared: string, bytes: Uint8Array): Promise<UiCommentAttachment> {
  if (bytes.byteLength > ATTACHMENT_BYTES) throw new Error('Attachment exceeds 10 MB')
  const directory = (await attachmentsDirectory(root, true))!
  const display = displayName(name)
  const stored = `${randomUUID()}-${safeName(display)}`
  await writeFile(join(directory, stored), bytes, { flag: 'wx' })
  return { path: `.histoire/attachments/${stored}`, name: display, mimeType: mediaType(bytes, declared), size: bytes.byteLength }
}

/**
 * Reads one stored attachment by generated name for thumbnails and downloads.
 * @param root Project root.
 * @param name Generated stored name.
 */
export async function readAttachment(root: string, name: string): Promise<{ bytes: Uint8Array, mimeType: string } | undefined> {
  if (!STORED_NAME.test(name)) return undefined
  const directory = await attachmentsDirectory(root, false)
  if (!directory) return undefined
  const entry = await lstat(join(directory, name)).catch(() => undefined)
  if (!entry?.isFile() || entry.size > ATTACHMENT_BYTES) return undefined
  const bytes = await readFile(join(directory, name))
  return { bytes, mimeType: imageType(bytes) ?? 'application/octet-stream' }
}

/**
 * Stored name of a project-relative attachment path, if it is a valid generated path.
 * @param path Project-relative path.
 */
export function attachmentName(path: string): string | undefined {
  const name = path.startsWith('.histoire/attachments/') ? path.slice('.histoire/attachments/'.length) : ''
  return STORED_NAME.test(name) ? name : undefined
}

/**
 * Whether a client-referenced attachment matches a stored regular file.
 * @param root Project root.
 * @param attachment Referenced attachment.
 */
export async function attachmentExists(root: string, attachment: UiCommentAttachment): Promise<boolean> {
  const name = attachmentName(attachment.path)
  const directory = name ? await attachmentsDirectory(root, false).catch(() => undefined) : undefined
  if (!name || !directory) return false
  const entry = await lstat(join(directory, name)).catch(() => undefined)
  return Boolean(entry?.isFile() && entry.size === attachment.size)
}

/**
 * Deletes stored files no longer referenced by any comment; invalid paths are ignored.
 * @param root Project root.
 * @param paths Project-relative attachment paths.
 */
export async function removeAttachments(root: string, paths: readonly string[]): Promise<void> {
  const directory = paths.length ? await attachmentsDirectory(root, false).catch(() => undefined) : undefined
  if (!directory) return
  await Promise.allSettled(paths.map(attachmentName).filter(Boolean).map(name => unlink(join(directory, name!))))
}
