import type { UiComment } from '@histoire/shared'

/** Separate structured context so ACP privacy toggles remain authoritative. */
export function commentAgentContext(comment: UiComment, relativePath: string) {
  return { storyId: comment.storyId, variantId: comment.variantId, props: comment.props, selector: comment.anchor.selector, screenshot: comment.screenshot, source: relativePath }
}

/** User task text never preembeds source/props/screenshots outside ACP privacy policy. */
export function commentPrompt(comment: UiComment): string {
  return [
    'Fix the issue described in this Histoire canvas comment. Follow the project instructions and ask for permissions through ACP when required.',
    `User comment:\n${comment.body}`,
    ...comment.thread.filter(message => message.author === 'user').map(message => `User reply:\n${message.body}`),
    'Reply with the outcome and report any changed project files. Do not claim tests passed unless run.',
  ].filter(Boolean).join('\n\n')
}
