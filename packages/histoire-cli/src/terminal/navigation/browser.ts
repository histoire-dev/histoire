import type { TerminalKey } from '../keys.js'
import type { TerminalViewHost } from '../views/registry.js'
import type { ListNavigation } from './list.js'
import type { SearchInput } from './search.js'
import { sanitizeText } from '../output/sanitize.js'
import { TERMINAL_BOUNDS } from '../protocol/core.js'
import { defaultStyle } from '../style.js'
import { renderViewFrame } from '../views/frame.js'
import { fitWidth, wrapWidth } from '../width.js'
import { createListNavigation } from './list.js'
import { createSearchInput } from './search.js'

/** Host capabilities the browser needs; a subset of the view host. */
export type BrowserHost = Pick<TerminalViewHost, 'size' | 'notify' | 'copy' | 'requestRender'>

/** What a history provides to be browsed; entries need a stable ID and a monotonic rank. */
export interface HistoryBrowserOptions<T> {
  host: BrowserHost
  /** Screen header. */
  title: string
  /** Plural noun used in counts, e.g. `log entries`. */
  noun: string
  /** Retained entries, oldest first. */
  items: () => readonly T[]
  /** Stable identity of an entry. */
  id: (item: T) => string
  /** Increasing order key (the session ID); lets a vanished selection move to the nearest retained entry. */
  rank: (item: T) => number
  /** Full sanitized text: searched, shown in detail and copied. */
  text: (item: T) => string
  /** Short plain label shown before the first line, e.g. `12 stderr`. */
  label: (item: T) => string
  /** Marks rows that deserve attention; only the label is colored. */
  tone?: (item: T) => 'error' | 'warn' | 'dim' | undefined
  /** Entries evicted by retention bounds since the session began. */
  omitted: () => number
  /** Observes appends and deletions; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /** Extra lines above the list (e.g. a failed phase). */
  header?: () => string[]
  /** Text shown while nothing matches; a function when it depends on live state. */
  empty: string | (() => string)
  /** Open the newest entry in detail on every entry to the screen (latest error). */
  startInDetail?: boolean
  /** Keep the cursor on the newest entry (append-only histories); `false` for result lists that start at the top. Default `true`. */
  follow?: boolean
  /** Replaces the status line above the list (receives the number of matching entries). */
  status?: (shown: number) => string
  /** Replaces the list footer hint. */
  footer?: string
}

/** View pieces of a browser, spread into a `TerminalView`. */
export interface HistoryBrowser<T> {
  enter: () => void
  leave: () => void
  capturesInput: () => boolean
  handleKey: (key: TerminalKey) => boolean
  render: (size: { columns: number, rows: number }) => string[]
  /** Selection, scrolling and follow state (exposed for tests and sibling views). */
  navigation: ListNavigation<T>
  /** The `/` prompt. */
  search: SearchInput
  /** Opens the selected entry in detail. */
  openDetail: () => void
  /** Whether an entry is open in detail (it then owns every key). */
  detailOpen: () => boolean
}

/** Copy-all is bounded to this many characters of the newest entries (same bound as retained log text). */
const COPY_ALL_MAX_CHARS = TERMINAL_BOUNDS.logBytes

/** Tab characters would break width accounting; the copied text keeps them. */
const showable = (text: string) => text.replaceAll('\t', '  ')

/**
 * Builds list + detail + search + copy behavior over any bounded history. Logs, the
 * latest-error screen and (slice 06) requests share it instead of cloning navigation.
 * Selection is kept by stable ID: appends never move it, eviction moves it to the nearest
 * retained entry, scrolling pauses following and End resumes.
 * @param options History access and presentation.
 */
export function createHistoryBrowser<T>(options: HistoryBrowserOptions<T>): HistoryBrowser<T> {
  const { host } = options
  const navigation = createListNavigation<T>({ id: options.id, rank: options.rank, follow: options.follow !== false })
  const search = createSearchInput()
  let unsubscribe: (() => void) | undefined
  /** Entry shown in detail; held directly, so eviction while reading does not blank the screen. */
  let detail: T | undefined
  let detailTop = 0

  /** Lowercased text per entry object, so filtering does not lowercase every entry on every render. */
  const lowered = new WeakMap<object, string>()

  /** Lowercased searchable text of an entry (cached for object entries, which retained records are). */
  function searchable(item: T): string {
    if (typeof item !== 'object' || item === null) return options.text(item).toLowerCase()
    let text = lowered.get(item)
    if (text === undefined) {
      text = options.text(item).toLowerCase()
      lowered.set(item, text)
    }
    return text
  }

  /** Entries matching the applied filter. */
  function visible(): readonly T[] {
    const needle = search.applied().toLowerCase()
    const all = options.items()
    return needle ? all.filter(item => searchable(item).includes(needle)) : all
  }

  /**
   * Joins entries for copy-all, newest first until the bound, so a huge history cannot
   * build an unbounded string. Returns the text and how many entries it holds.
   */
  function joinBounded(items: readonly T[]): { text: string, count: number } {
    const parts: string[] = []
    let size = 0
    for (let index = items.length - 1; index >= 0; index--) {
      const part = options.text(items[index])
      if (parts.length && size + part.length + 1 > COPY_ALL_MAX_CHARS) break
      parts.push(part)
      size += part.length + 1
    }
    return { text: parts.reverse().join('\n'), count: parts.length }
  }

  /** Copies and reports; the text stays on screen whatever happens. Retained text is clean already, sanitizing again keeps the guarantee local. */
  async function copy(text: string, what: string) {
    const result = await host.copy(sanitizeText(text))
    host.notify(result.ok ? `Copied ${what}${result.note ? ` (${result.note})` : ''}` : `Copy unavailable: ${result.reason}. Text is still shown`)
  }

  /** Wrapped lines of the open entry. */
  const detailLines = (columns: number) => wrapWidth(showable(options.text(detail!)), Math.max(1, columns - 2))

  /** Scrolls the detail text, clamped. */
  function scrollDetail(delta: number, rows: number) {
    const total = detailLines(host.size().columns).length
    detailTop = Math.max(0, Math.min(detailTop + delta, Math.max(0, total - rows)))
  }

  /** Keys while an entry is open in detail. */
  function detailKey(key: TerminalKey) {
    const page = Math.max(1, host.size().rows - 2)
    if (key.name === 'escape' || key.name === 'return') detail = undefined
    else if (key.char === 'y') void copy(options.text(detail!), 'entry')
    else if (key.name === 'up') scrollDetail(-1, page)
    else if (key.name === 'down') scrollDetail(1, page)
    else if (key.name === 'pageup') scrollDetail(-page, page)
    else if (key.name === 'pagedown') scrollDetail(page, page)
    else if (key.name === 'home') detailTop = 0
    else if (key.name === 'end') scrollDetail(Number.MAX_SAFE_INTEGER, page)
    else return false
    return true
  }

  /** Opens the selected entry. */
  function openDetail() {
    const item = navigation.selectedItem()
    if (!item) return
    detail = item
    detailTop = 0
  }

  /** Status line above the list. */
  function status(shown: number): string {
    const parts = [navigation.following() ? 'Following' : 'Paused, End follows', `${shown} of ${options.items().length} ${options.noun}`]
    if (search.applied()) parts.push(`filter "${search.applied()}"`)
    if (options.omitted()) parts.push(`${options.omitted()} older omitted`)
    return defaultStyle().dim(parts.join(' · '))
  }

  /** One list row; the selected row is inverse, other rows tint only their label. */
  function row(item: T, selected: boolean, columns: number): string {
    const [first, ...rest] = showable(options.text(item)).split('\n')
    const tone = options.tone?.(item)
    const label = tone && !selected ? defaultStyle()[tone](options.label(item)) : options.label(item)
    const line = fitWidth(`${selected ? '›' : ' '} ${label} ${first}${rest.length ? ` (+${rest.length} lines)` : ''}`, columns)
    return selected ? `\u001B[7m${line}\u001B[27m` : line
  }

  /** Detail screen. */
  function renderDetail(size: { columns: number, rows: number }) {
    const lines = detailLines(size.columns).map(line => ` ${line}`)
    return renderViewFrame({ title: `${options.title} · ${options.label(detail!)}`, body: lines.slice(detailTop, detailTop + size.rows - 2), footer: 'Up/Down scroll · y copy · Enter or Esc list · q back', ...size })
  }

  return {
    navigation,
    search,
    openDetail,
    detailOpen: () => detail !== undefined,
    enter() {
      detail = undefined
      navigation.setItems(visible())
      if (options.startInDetail) {
        navigation.end()
        openDetail()
      }
      unsubscribe = options.subscribe(() => {
        navigation.setItems(visible())
        host.requestRender()
      })
    },
    leave() {
      unsubscribe?.()
      unsubscribe = undefined
      detail = undefined
    },
    capturesInput: () => search.active(),
    handleKey(key) {
      if (detail) return detailKey(key)
      if (search.handleKey(key)) {
        navigation.setItems(visible())
        return true
      }
      if (navigation.handleKey(key, Math.max(1, host.size().rows - 4))) return true
      if (key.name === 'return') {
        openDetail()
      }
      else if (key.char === 'y') {
        const item = navigation.selectedItem()
        if (item) void copy(options.text(item), 'entry')
      }
      else if (key.char === 'Y') {
        const items = visible()
        if (items.length) {
          const { text, count } = joinBounded(items)
          void copy(text, count < items.length ? `newest ${count} of ${items.length} ${options.noun} (size limit)` : `${count} ${options.noun}`)
        }
      }
      else {
        return false
      }
      return true
    },
    render(size) {
      if (detail) return renderDetail(size)
      const items = visible()
      navigation.setItems(items)
      const extra = options.header?.() ?? []
      const window = navigation.window(Math.max(1, size.rows - 3 - extra.length))
      const selectedId = navigation.selectedId()
      const body = [...extra, options.status ? options.status(items.length) : status(items.length), ...window.items.map(item => row(item, options.id(item) === selectedId, size.columns))]
      if (!window.items.length) body.push(`  ${typeof options.empty === 'function' ? options.empty() : options.empty}`)
      return renderViewFrame({ title: options.title, body, footer: search.active() ? `/${search.text()}▏` : options.footer ?? 'Up/Down Home/End · Enter detail · / search · y copy · Y copy all · Esc back', ...size })
    },
  }
}
