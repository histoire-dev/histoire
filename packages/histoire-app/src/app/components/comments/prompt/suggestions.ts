import type { Ref } from 'vue'
import { computed, nextTick, onScopeDispose, ref, shallowRef } from 'vue'

/** One row of the `@` / `/` suggestion list. */
export interface PromptSuggestion {
  /** Stable row identity. */
  id: string
  /** Primary text. */
  label: string
  /** Dimmed secondary text. */
  detail?: string
  /** Offline glyph name. */
  icon: string
  /** Text replacing the trigger and query. */
  insert: string
}

/** Active trigger under the caret. */
export interface PromptTrigger {
  /** Trigger character. */
  char: '@' | '/'
  /** Text typed after the trigger. */
  query: string
  /** Index of the trigger character. */
  start: number
  /** Caret index ending the query. */
  end: number
}

/** Suggestion provider per trigger; may be async (server search). */
export type PromptSuggestionSources = Partial<Record<PromptTrigger['char'], (query: string) => PromptSuggestion[] | Promise<PromptSuggestion[]>>>

/**
 * Finds the trigger the caret is completing: `@` at the start or after whitespace, `/` at the very start.
 * @param text Field value.
 * @param caret Caret index.
 */
export function detectTrigger(text: string, caret: number): PromptTrigger | undefined {
  const before = text.slice(0, caret)
  const command = before.match(/^\/([\w:.-]*)$/)
  if (command) return { char: '/', query: command[1], start: 0, end: caret }
  const mention = before.match(/(?:^|\s)@([^\s@]*)$/)
  if (mention) return { char: '@', query: mention[1], start: caret - mention[1].length - 1, end: caret }
}

/**
 * Suggestion list state for a textarea: trigger detection, debounced loading, keyboard navigation and insertion.
 * @param options Field, value writer and suggestion sources.
 * @param options.input Bound textarea; its live DOM value is read so detection never lags the model.
 * @param options.update Writes a new field value.
 * @param options.sources Provider per trigger character.
 */
export function useSuggestions(options: { input: Ref<HTMLTextAreaElement | undefined>, update: (value: string) => void, sources: () => PromptSuggestionSources }) {
  const trigger = shallowRef<PromptTrigger>()
  const items = shallowRef<PromptSuggestion[]>([])
  const active = ref(0)
  /** Items belong to the current trigger, so an empty list means no results. */
  const settled = ref(false)
  let request = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  /** List is rendered for the current query; stale rows of a loading query stay inert. */
  const visible = computed(() => Boolean(trigger.value && settled.value))
  /** A rendered row exists for the field's `aria-activedescendant`. */
  const open = computed(() => visible.value && items.value.length > 0)
  // A pending debounced search must not fire into an unmounted field.
  onScopeDispose(() => clearTimeout(timer))
  /** Dismiss the list and retire any in-flight load. */
  function close(): void {
    clearTimeout(timer)
    request++
    trigger.value = undefined
    items.value = []
    settled.value = false
  }
  /** Re-evaluate the trigger after input, caret moves or focus. */
  function refresh(): void {
    const input = options.input.value
    const found = input && input.selectionStart === input.selectionEnd ? detectTrigger(input.value, input.selectionStart) : undefined
    const source = found && options.sources()[found.char]
    if (!found || !source) return close()
    const changed = found.char !== trigger.value?.char || found.query !== trigger.value?.query
    trigger.value = found
    if (!changed) return
    clearTimeout(timer)
    settled.value = false
    const current = ++request
    /** Apply results only for the latest query. */
    const load = async () => {
      const result = await Promise.resolve(source(found.query)).catch(() => [])
      if (current !== request) return
      items.value = result
      active.value = 0
      settled.value = true
    }
    // Server search waits for typing to pause; local lists update immediately.
    if (found.char === '@') timer = setTimeout(load, 120)
    else void load()
  }
  /** Replace the trigger and query with the picked row, keeping the caret after it. */
  function pick(index = active.value): void {
    const found = trigger.value
    const item = items.value[index]
    if (!found || !item) return
    const value = options.input.value?.value ?? ''
    const next = `${value.slice(0, found.start)}${item.insert} ${value.slice(found.end)}`
    const caret = found.start + item.insert.length + 1
    close()
    options.update(next)
    void nextTick(() => {
      options.input.value?.focus()
      options.input.value?.setSelectionRange(caret, caret)
    })
  }
  /** Keyboard navigation while the list is visible; returns whether the key was consumed. */
  function keydown(event: KeyboardEvent): boolean {
    // IME composition owns Enter/arrows until it commits (keyCode 229 covers older engines).
    if (event.isComposing || event.keyCode === 229) return false
    if (!visible.value || event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key === 'Escape') {
      close()
    }
    else if (!open.value) {
      return false
    }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      active.value = (active.value + step + items.value.length) % items.value.length
    }
    else if (event.key === 'Enter' || event.key === 'Tab') {
      pick()
    }
    else {
      return false
    }
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  return { trigger, items, active, visible, open, refresh, pick, keydown, close }
}
