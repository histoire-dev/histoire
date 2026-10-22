import type { UiAgentThreadBase, UiCommentAttachment } from '@histoire/shared'
import type { PromptFile } from '../acp/prompt-blocks.js'

/** Slash commands are a leading `/name` that agents only recognize at the very start of a prompt. */
const COMMAND = /^\/([\w:.-]+)(?:\s|$)/

/**
 * Text the user just sent: latest user reply, or the first message when none.
 * @param comment Thread being dispatched.
 */
export function latestUserBody(comment: UiAgentThreadBase): string {
  return comment.thread.findLast(message => message.author === 'user')?.body ?? comment.body
}

/**
 * Whether the message being sent is an agent slash command, sent raw instead of wrapped.
 * Only a leading `/name` the agent announced counts, so text like "/api returns 500"
 * stays a normal message.
 * @param comment Comment being dispatched.
 * @param commands Announced command names, with or without the leading slash.
 */
export function isCommentCommand(comment: UiAgentThreadBase, commands: readonly string[]): boolean {
  const name = COMMAND.exec(latestUserBody(comment))?.[1]
  if (!name) return false
  return commands.some(command => command.replace(/^\//, '') === name)
}

/**
 * Every attachment in the conversation, so a new agent session after restart sees them all.
 * @param comment Comment being dispatched.
 */
export function commentAttachments(comment: UiAgentThreadBase): UiCommentAttachment[] {
  return [...comment.attachments ?? [], ...comment.thread.flatMap(message => message.author === 'user' ? message.attachments ?? [] : [])]
}

/**
 * `@path` mentions of indexed project files, in order and without duplicates.
 * @param body User-authored text.
 * @param files Indexed project-relative paths.
 * @param limit Maximum mentions.
 */
export function extractMentions(body: string, files: ReadonlySet<string>, limit = 20): string[] {
  const found = new Set<string>()
  for (const [, token] of body.matchAll(/(?:^|\s)@([^\s@]+)/g)) {
    // Trailing sentence punctuation is not part of the path unless the file exists with it.
    const path = files.has(token) ? token : token.replace(/[.,;:!?)\]'"]+$/, '')
    if (files.has(path)) found.add(path)
    if (found.size >= limit) break
  }
  return [...found]
}

/**
 * Uploads and indexed `@` mentions of the whole conversation. Files of earlier user
 * messages are flagged `earlier`, so an agent session that already saw them can skip
 * them; the latest user message's files are never flagged. A file referenced both
 * earlier and in the latest message counts as latest.
 * @param comment Comment or thread being dispatched.
 * @param files Indexed project-relative paths.
 * @param limit Maximum mentioned files, latest message first.
 */
export function commentPromptFiles(comment: UiAgentThreadBase, files: ReadonlySet<string>, limit = 20): PromptFile[] {
  const messages = [{ body: comment.body, attachments: comment.attachments }, ...comment.thread.filter(message => message.author === 'user')]
  const seen = new Set<string>()
  const groups: PromptFile[][] = []
  let mentions = 0
  // Walk latest first so the latest message wins duplicates and the mention cap.
  for (let index = messages.length - 1; index >= 0; index--) {
    const flag = index < messages.length - 1 ? { earlier: true } : {}
    const group: PromptFile[] = []
    for (const { path, name, mimeType } of messages[index].attachments ?? []) {
      if (!seen.has(path)) group.push({ path, name, mimeType, ...flag })
      seen.add(path)
    }
    const mentioned = mentions < limit ? extractMentions(messages[index].body, files, limit - mentions) : []
    for (const path of mentioned.filter(path => !seen.has(path))) {
      group.push({ path, ...flag })
      seen.add(path)
      mentions++
    }
    groups.unshift(group)
  }
  return groups.flat()
}
