import type { UiAiThread } from '@histoire/shared'
import type { AiThreadDraftInput } from '../../ai-threads/validate.js'
import type { Context } from '../../context.js'
import { isPinnedThread } from '@histoire/shared'
import { listScreenshotFiles } from './files.js'

/**
 * Collected story file of a thread target; pinned threads also need their exact variant.
 * Orphan threads stay stored but cannot be pinned again or dispatched with canvas context.
 * @param ctx Dev context.
 * @param thread Thread or draft.
 * @returns Story file, or undefined when the thread has no story context.
 */
export function threadStoryFile(ctx: Context, thread: Pick<UiAiThread, 'context' | 'anchor'>) {
  if (!thread.context) return undefined
  const { storyId, variantId } = thread.context
  const file = ctx.storyFiles.find(file => file.story?.id === storyId)
  if (!file?.story || (variantId && !file.story.variants.some(variant => variant.id === variantId))) throw new Error(isPinnedThread(thread) ? 'Comment target unavailable' : 'AI thread story unavailable')
  return file
}

/**
 * Admission check of a draft target: a collected story, and for pinned threads a variant
 * on a story with a canvas (not docs-only) plus a generated screenshot of that variant.
 * @param ctx Dev context.
 * @param draft Shape-validated draft.
 */
export async function assertThreadTarget(ctx: Context, draft: AiThreadDraftInput): Promise<void> {
  const file = threadStoryFile(ctx, draft)
  if (!isPinnedThread(draft)) return
  if (file!.story!.docsOnly) throw new Error('Comment target unavailable')
  if (draft.screenshot && !(await listScreenshotFiles(ctx.root)).some(file => file.path === draft.screenshot && file.storyId === draft.context.storyId && file.variantId === draft.context.variantId)) throw new Error('Comment screenshot unavailable')
}
