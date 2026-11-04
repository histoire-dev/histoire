import type { TestCaseDto } from '../protocol/tests.js'
import type { TestsConsole } from './console.js'
import { sanitizeText } from '../output/sanitize.js'

/** One loaded case with the position that keeps list order stable. */
export interface ResultRow {
  /** Stable identity: story, variant and case ID. */
  id: string
  /** Position in the retained order (failures first). */
  rank: number
  /** Case as the child retained it. */
  case: TestCaseDto
}

/** What the results list currently holds. */
export type ResultsStatus = 'none' | 'loading' | 'ready' | 'unavailable' | 'failed'

/** Paged, cached view of the cases of the operation the console shows. */
export interface ResultsList {
  /** Loaded rows in retained order. */
  rows: () => readonly ResultRow[]
  /** Cases matching the filter that the child retained (loaded or not). */
  total: () => number
  /** Load state of the first page. */
  status: () => ResultsStatus
  /** Why nothing is readable (`evicted`, `retired`, ...) or the read failure. */
  reason: () => string | undefined
  /** More pages exist beyond the loaded rows. */
  hasMore: () => boolean
  /** Failures-only filter. */
  failuresOnly: () => boolean
  /** Toggles the failures-only filter and reloads. */
  setFailuresOnly: (value: boolean) => void
  /** Reloads when the viewed operation, its finality or the filter changed; call on every state change. */
  sync: () => void
  /** Requests the next page. */
  loadMore: () => void
  /** Observes loads. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/** Plain text of one case for search, detail and copy. */
export function describeCase(item: TestCaseDto): string {
  const where = [item.storyId, item.variantId].filter(Boolean).join(' / ')
  const errors = item.unavailable ? ['Failure text was dropped, it exceeded the size bound'] : item.errors
  return sanitizeText([`${item.fullName || item.name}${where ? ` (${where})` : ''}`, ...errors].join('\n'))
}

/**
 * Loads result pages of the viewed operation through the cached state. Only completed
 * operations have cases; pages of a replaced runtime stay `retired` and are never rebuilt.
 * @param tests Console deciding which operation is shown.
 */
export function createResultsList(tests: TestsConsole): ResultsList {
  const listeners = new Set<() => void>()
  let rows: ResultRow[] = []
  let total = 0
  let next: string | undefined
  let status: ResultsStatus = 'none'
  let reason: string | undefined
  let failuresOnly = false
  /** Identity of what is loaded; a different key starts over. */
  let loadedKey = ''
  /** Fences replies of superseded loads. */
  let epoch = 0
  let loadingMore = false

  const notify = () => listeners.forEach(listener => listener())

  /** Reads one page and appends or replaces rows. */
  async function load(operationId: string, cursor: string | undefined, mine: number) {
    try {
      const page = await tests.state.results(operationId, { cursor, failedOnly: failuresOnly || undefined })
      if (mine !== epoch) return
      if (page.unavailable) {
        status = 'unavailable'
        reason = page.unavailable
      }
      else {
        const offset = rows.length
        rows = [...rows, ...page.cases.map((item, index) => ({ id: `${item.storyId ?? ''}|${item.variantId ?? ''}|${item.id}`, rank: offset + index, case: item }))]
        total = page.total
        next = page.next
        status = 'ready'
      }
    }
    catch (error) {
      if (mine !== epoch) return
      status = 'failed'
      reason = error instanceof Error ? error.message : String(error)
    }
    loadingMore = false
    notify()
  }

  /** Starts over for a new operation or filter. */
  function reset(key: string, entryId: string | undefined, completed: boolean) {
    loadedKey = key
    epoch++
    rows = []
    total = 0
    next = undefined
    reason = undefined
    loadingMore = false
    if (!entryId || !completed) {
      status = 'none'
      return notify()
    }
    status = 'loading'
    notify()
    void load(entryId, undefined, epoch)
  }

  /** Reloads when the viewed operation, its finality or the filter changed. */
  function sync() {
    const entry = tests.viewed()
    const completed = entry?.operation.state === 'completed' && !entry.lost
    const key = `${entry?.operation.id ?? ''}|${completed}|${failuresOnly}`
    if (key !== loadedKey) reset(key, entry?.operation.id, completed)
  }

  return {
    rows: () => rows,
    total: () => total,
    status: () => status,
    reason: () => reason,
    hasMore: () => next !== undefined,
    failuresOnly: () => failuresOnly,
    setFailuresOnly(value) {
      failuresOnly = value
      loadedKey = ''
      sync()
    },
    sync,
    loadMore() {
      const entry = tests.viewed()
      if (next === undefined || loadingMore || !entry) return
      loadingMore = true
      void load(entry.operation.id, next, epoch)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
