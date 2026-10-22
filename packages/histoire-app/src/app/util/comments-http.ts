import type { UiCommentAttachment, UiProjectFile } from '@histoire/shared'
import { jsonBody, requestJson, uiHttpUrl } from './http-json.js'

/** Dev-server comment routes. */
const prefix = () => uiHttpUrl('comments/')

/**
 * Ranked project files for an `@` mention.
 * @param query Text typed after `@`.
 */
export async function searchProjectFiles(query: string): Promise<UiProjectFile[]> {
  return (await requestJson<{ files: UiProjectFile[] }>(`${prefix()}files/search`, jsonBody({ query }), 'Cannot search files')).files
}

/**
 * Stores one file beneath `.histoire/attachments`.
 * @param file Picked, dropped or pasted file.
 */
export function uploadAttachment(file: File): Promise<UiCommentAttachment> {
  const query = new URLSearchParams({ name: file.name || `pasted-${Date.now()}.png`, type: file.type })
  return requestJson<UiCommentAttachment>(`${prefix()}attachments?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file }, 'Cannot attach file')
}

/**
 * Copies a stored screenshot into `.histoire/attachments`, so it attaches like an upload.
 * @param path Project-relative stored screenshot path.
 */
export function attachScreenshot(path: string): Promise<UiCommentAttachment> {
  return requestJson<UiCommentAttachment>(`${prefix()}attachments/from-screenshot`, jsonBody({ path }), 'Cannot attach screenshot')
}

/**
 * Same-origin URL of a stored attachment.
 * @param path Project-relative stored path.
 */
export function attachmentUrl(path: string): string {
  return `${prefix()}attachments/${encodeURIComponent(path.split('/').pop()!)}`
}
