import type { TerminalKey } from '../keys.js'

/** `/` search prompt state shared by detail views. */
export interface SearchInput {
  /** Whether the prompt is being edited; the view must then route every key here. */
  active: () => boolean
  /** Text shown in the prompt: the draft while editing, otherwise the applied filter. */
  text: () => string
  /** Applied filter (empty when none). */
  applied: () => string
  /**
   * Handles a key. While editing it consumes everything printable (so action keys
   * cannot fire), Enter applies, Escape cancels. Returns whether the key was consumed.
   */
  handleKey: (key: TerminalKey) => boolean
  /** Drops the applied filter and any draft. */
  clear: () => void
}

/**
 * Creates a search prompt. Opened with `/`; Ctrl+C is never seen here because the
 * session handles it before views.
 */
export function createSearchInput(): SearchInput {
  let editing = false
  let draft = ''
  let applied = ''
  return {
    active: () => editing,
    text: () => editing ? draft : applied,
    applied: () => applied,
    clear() {
      editing = false
      draft = ''
      applied = ''
    },
    handleKey(key) {
      if (!editing) {
        if (key.char !== '/') return false
        editing = true
        draft = applied
        return true
      }
      if (key.name === 'return') {
        applied = draft
        editing = false
      }
      else if (key.name === 'escape') {
        editing = false
        draft = ''
      }
      else if (key.name === 'backspace') {
        draft = Array.from(draft).slice(0, -1).join('')
      }
      else if (key.char) {
        draft += key.char
      }
      // Unknown control keys are swallowed too: nothing may leak to main actions.
      return true
    },
  }
}
