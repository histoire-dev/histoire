import type { Ref } from 'vue'
import type { usePromptAttachments } from './attachments.js'
import type { useSuggestions } from './suggestions.js'
import { nextTick, ref } from 'vue'
import { createShortcutRegistry, matchesShortcut, useShortcutRegistry } from '../../../util/shortcuts.js'

/**
 * Captures a screenshot for the message. Resolving with a stored screenshot path attaches it;
 * resolving with nothing means the caller handled the capture itself (comment drafts).
 */
export type PromptCapture = () => Promise<string | undefined> | void

/**
 * Attach-menu and keyboard actions of the prompt: files, screenshot capture, `@` mentions, `/` commands.
 * @param options Prompt parts the actions drive.
 * @param options.input Message field.
 * @param options.picker Hidden file input.
 * @param options.update Writes the message text.
 * @param options.files Attachment state.
 * @param options.suggestions Suggestion list state.
 * @param options.capture Screenshot capture, when this prompt offers one.
 * @param options.locked Actions are refused while true.
 */
export function usePromptActions(options: { input: Ref<HTMLTextAreaElement | undefined>, picker: Ref<HTMLInputElement | undefined>, update: (value: string) => void, files: ReturnType<typeof usePromptAttachments>, suggestions: ReturnType<typeof useSuggestions>, capture: () => PromptCapture | undefined, locked: () => boolean }) {
  const shortcuts = useShortcutRegistry() ?? createShortcutRegistry()
  /** Capture in flight. */
  const capturing = ref(false)
  /** Insert text at the caret (or replace the selection) and refresh suggestions. */
  async function insert(text: string, at?: number): Promise<void> {
    const field = options.input.value
    if (!field) return
    const start = at ?? field.selectionStart
    const end = at ?? field.selectionEnd
    options.update(`${field.value.slice(0, start)}${text}${field.value.slice(end)}`)
    await nextTick()
    field.focus()
    field.setSelectionRange(start + text.length, start + text.length)
    options.suggestions.refresh()
  }
  const actions = {
    capturing,
    /** Open the system file picker. */
    openFiles(): void {
      if (!options.locked()) options.picker.value?.click()
    },
    /** Insert `@` at the caret, spaced from a preceding word. */
    mention(): Promise<void> {
      const field = options.input.value
      const caret = field?.selectionStart ?? 0
      return insert(caret > 0 && !/\s/.test(field?.value[caret - 1] ?? '') ? ' @' : '@')
    },
    /** Start the message with `/` to list agent commands. */
    command(): Promise<void> {
      return options.input.value?.value.startsWith('/') ? insert('', 1) : insert('/', 0)
    },
    /** Capture a screenshot; a returned path is attached as a copy. */
    async screenshot(): Promise<void> {
      const capture = options.capture()
      if (!capture || capturing.value || options.locked()) return
      capturing.value = true
      try {
        const path = await capture()
        if (path) await options.files.addScreenshot(path)
      }
      catch (error) { options.files.fail(error instanceof Error ? error.message : 'Screenshot unavailable. Retry capture.') }
      finally { capturing.value = false }
    },
    /** Readable shortcut of an action, for menu hints. */
    hint: (id: 'comment.attach' | 'comment.screenshot') => shortcuts.hint(id),
    /** Prompt shortcuts (attach files, capture); returns whether the key was handled. */
    keydown(event: KeyboardEvent): boolean {
      if (event.repeat) return false
      const keys = (id: string) => shortcuts.reference.get(id)?.keys ?? []
      const run = keys('comment.attach').some(key => matchesShortcut(key, event))
        ? actions.openFiles
        : options.capture() && keys('comment.screenshot').some(key => matchesShortcut(key, event)) ? actions.screenshot : undefined
      if (!run) return false
      event.preventDefault()
      event.stopPropagation()
      void run()
      return true
    },
  }
  return actions
}
