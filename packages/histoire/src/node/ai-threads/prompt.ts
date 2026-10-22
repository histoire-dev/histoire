import type { UiAiThread, UiPinnedAiThread } from '@histoire/shared'
import type { Context } from '../context.js'
import type { AiProjectContext } from './project-context.js'
import { isCommentCommand, latestUserBody } from '../comments/prompt.js'

/**
 * Structured story context for ACP privacy policy; absent without a story chip.
 * @param thread Thread being dispatched.
 * @param ctx Dev context resolving the story file.
 */
export function aiThreadContext(thread: UiAiThread, ctx: Context) {
  if (!thread.context) return undefined
  const file = ctx.storyFiles.find(file => file.story?.id === thread.context!.storyId)
  return { storyId: thread.context.storyId, variantId: thread.context.variantId, source: file?.relativePath }
}

/**
 * Task text with project story conventions so the agent writes collectable stories.
 * Slash commands are sent raw, as agents only recognize them at the start.
 * @param thread Thread being dispatched.
 * @param project Story conventions of the project.
 * @param commands Slash command names the agent announced.
 */
export function aiThreadPrompt(thread: UiAiThread, project: AiProjectContext, commands: readonly string[]): string {
  if (isCommentCommand(thread, commands)) return latestUserBody(thread)
  return [
    'You are working in a Histoire project from its AI panel. Follow the project instructions and ask for permissions through ACP when required.',
    `Story conventions: ${JSON.stringify(project)}. New stories must match storyMatch and follow the example stories.`,
    `User request:\n${thread.body}`,
    ...thread.thread.filter(message => message.author === 'user').map(message => `User reply:\n${message.body}`),
    'Reply with the outcome and report any changed project files. Do not claim tests passed unless run.',
  ].join('\n\n')
}

/**
 * Structured canvas context of a pinned thread, kept separate so ACP privacy toggles remain authoritative.
 * @param thread Pinned thread being dispatched.
 * @param relativePath Project-relative story file.
 */
export function commentAgentContext(thread: UiPinnedAiThread, relativePath: string) {
  return { storyId: thread.context.storyId, variantId: thread.context.variantId, props: thread.props, selector: thread.anchor.selector, screenshot: thread.screenshot, source: relativePath }
}

/**
 * Canvas comment task text; it never preembeds source/props/screenshots outside ACP privacy policy.
 * @param thread Pinned thread being dispatched.
 * @param commands Slash command names the agent announced; see {@link isCommentCommand}.
 */
export function commentPrompt(thread: UiPinnedAiThread, commands: readonly string[]): string {
  if (isCommentCommand(thread, commands)) return latestUserBody(thread)
  return [
    'Fix the issue described in this Histoire canvas comment. Follow the project instructions and ask for permissions through ACP when required.',
    `User comment:\n${thread.body}`,
    ...thread.thread.filter(message => message.author === 'user').map(message => `User reply:\n${message.body}`),
    'Reply with the outcome and report any changed project files. Do not claim tests passed unless run.',
  ].join('\n\n')
}
