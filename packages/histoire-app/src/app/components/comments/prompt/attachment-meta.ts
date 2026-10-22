import type { UiCommentAttachment } from '@histoire/shared'

/**
 * Compact byte size (B / KB / MB).
 * @param bytes Size in bytes.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * File type and size line of a non-image attachment, e.g. `TXT · 2 KB`.
 * @param attachment Stored attachment.
 */
export function attachmentMeta(attachment: UiCommentAttachment): string {
  const extension = attachment.name.includes('.') ? attachment.name.split('.').pop()!.toUpperCase() : 'FILE'
  return `${extension} · ${formatSize(attachment.size)}`
}

/**
 * Whether an attachment renders as an image tile.
 * @param attachment Stored attachment.
 */
export function isImage(attachment: UiCommentAttachment): boolean {
  return attachment.mimeType.startsWith('image/')
}
