import type { TerminalKey } from '../keys.js'

/** Visible slice of a navigable list. */
export interface ListWindow<T> {
  /** Items to draw, in order. */
  items: readonly T[]
  /** Index of the first drawn item in the whole list. */
  start: number
  /** Index of the selected item inside `items`, or -1 when it is outside or unresolved. */
  selected: number
}

/**
 * Cursor over an ordered list with selection kept by stable ID, never by array offset.
 * Append-only histories use follow mode: the cursor tracks the newest item until the
 * user scrolls away; `end()` resumes following.
 */
export interface ListNavigation<T> {
  /** Replaces the items; the selection follows its ID, or stays unresolved when the ID is gone. */
  setItems: (items: readonly T[]) => void
  /** Selected ID; survives the item disappearing (unresolved selection). */
  selectedId: () => string | undefined
  /** Selected item, undefined when nothing is selected or the ID is unresolved. */
  selectedItem: () => T | undefined
  /** Selects an ID explicitly (does not require it to exist yet). */
  select: (id: string | undefined) => void
  /** Moves the cursor by items; leaves follow mode when moving up. */
  move: (delta: number) => void
  /** Moves by `pageSize` items. */
  page: (direction: 1 | -1, pageSize: number) => void
  /** Jumps to the first item and pauses following. */
  home: () => void
  /** Jumps to the last item and resumes following. */
  end: () => void
  /** Whether the cursor tracks the newest item. */
  following: () => boolean
  /** Items to draw in `height` rows, keeping the cursor visible. */
  window: (height: number) => ListWindow<T>
  /** Applies arrow/page/home/end keys; returns whether the key was consumed. */
  handleKey: (key: TerminalKey, pageSize: number) => boolean
}

/**
 * Creates list navigation.
 * @param options Stable ID reader and whether to start in follow mode.
 * @param options.id Stable ID of an item.
 * @param options.follow Start in follow mode.
 * @param options.rank Monotonic ordering key of an item (e.g. a history's increasing ID). When given,
 * a selection whose item disappeared (evicted, cleared, filtered out) moves to the nearest remaining
 * item instead of staying unresolved. Omit for lists that keep an unresolved selection on purpose.
 */
export function createListNavigation<T>(options: { id: (item: T) => string, follow?: boolean, rank?: (item: T) => number }): ListNavigation<T> {
  let items: readonly T[] = []
  let selected: string | undefined
  /** Last resolved offset, used to keep a window position while the selection is unresolved. */
  let anchor = 0
  let follow = options.follow === true
  let firstVisible = 0
  /** Rank of the last resolved selection; the reference point when its item disappears. */
  let selectedRank: number | undefined

  const indexOf = () => selected === undefined ? -1 : items.findIndex(item => options.id(item) === selected)

  /** Selects by offset, clamped; offsets are transient, the ID is the identity. */
  function selectIndex(index: number) {
    if (!items.length) return
    anchor = Math.min(Math.max(index, 0), items.length - 1)
    selected = options.id(items[anchor])
    selectedRank = options.rank?.(items[anchor])
  }

  /** Moves a vanished selection to the retained item closest in rank (the later one on a tie). */
  function selectNearest() {
    const rank = options.rank!
    const after = items.findIndex(item => rank(item) >= selectedRank!)
    if (after < 0) return selectIndex(items.length - 1)
    if (after > 0 && selectedRank! - rank(items[after - 1]) < rank(items[after]) - selectedRank!) return selectIndex(after - 1)
    selectIndex(after)
  }

  const self: ListNavigation<T> = {
    setItems(next) {
      items = next
      if (follow && items.length) selectIndex(items.length - 1)
      else if (selected === undefined && items.length) selectIndex(0)
      else if (indexOf() >= 0) anchor = indexOf()
      else if (options.rank && selectedRank !== undefined && items.length) selectNearest()
    },
    selectedId: () => selected,
    selectedItem: () => items[indexOf()],
    select(id) {
      selected = id
      follow = false
      if (indexOf() >= 0) {
        anchor = indexOf()
        selectedRank = options.rank?.(items[anchor])
      }
    },
    move(delta) {
      const current = indexOf()
      selectIndex((current >= 0 ? current : anchor) + delta)
      follow = false
    },
    page(direction, pageSize) {
      self.move(direction * Math.max(1, pageSize))
    },
    home() {
      follow = false
      selectIndex(0)
    },
    end() {
      follow = true
      selectIndex(items.length - 1)
    },
    following: () => follow,
    window(height) {
      const size = Math.max(1, height)
      const current = indexOf() >= 0 ? indexOf() : anchor
      // Scroll only as far as needed to keep the cursor inside the window.
      if (current < firstVisible) firstVisible = current
      else if (current >= firstVisible + size) firstVisible = current - size + 1
      firstVisible = Math.max(0, Math.min(firstVisible, Math.max(0, items.length - size)))
      const shown = items.slice(firstVisible, firstVisible + size)
      return { items: shown, start: firstVisible, selected: indexOf() >= firstVisible && indexOf() < firstVisible + size ? indexOf() - firstVisible : -1 }
    },
    handleKey(key, pageSize) {
      const move: Record<string, () => void> = {
        up: () => self.move(-1),
        down: () => self.move(1),
        pageup: () => self.page(-1, pageSize),
        pagedown: () => self.page(1, pageSize),
        home: () => self.home(),
        end: () => self.end(),
      }
      const run = Object.hasOwn(move, key.name) ? move[key.name] : undefined
      run?.()
      return run !== undefined
    },
  }
  return self
}
