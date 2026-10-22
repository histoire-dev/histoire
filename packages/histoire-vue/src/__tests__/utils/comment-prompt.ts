import type { UiCommentAgent } from '@histoire/shared'

/** One idle agent advertising two slash commands. */
export const commandAgents: UiCommentAgent[] = [{ id: 'claude', name: 'Claude Code', state: 'idle', commands: [{ name: 'review', description: 'Review changes' }, { name: 'init', description: 'Create AGENTS.md' }] }]

/** Two ready agents; Codex is the configured default destination. */
export const readyAgents: UiCommentAgent[] = [{ id: 'claude', name: 'Claude Code', state: 'ready' }, { id: 'codex', name: 'Codex', state: 'ready', default: true }]

/**
 * Cancelable paste event carrying clipboard files and optional plain text.
 * @param files Clipboard files.
 * @param text Clipboard `text/plain` value.
 */
export function pasteEvent(files: File[], text = ''): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { files, items: [], getData: (type: string) => type === 'text/plain' ? text : '' } })
  return event
}

/**
 * Small image file as a user would paste or drop it.
 * @param name File name.
 */
export function pngFile(name = 'a.png'): File {
  return new File(['png'], name, { type: 'image/png' })
}
