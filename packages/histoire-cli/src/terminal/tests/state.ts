import type { TerminalBridge } from '../bridge.js'
import type { TestOperationDto, TestOperationState, TestProgressDto, TestResultsPage } from '../protocol/tests.js'
import type { TestsClient } from './client.js'
import { Buffer } from 'node:buffer'
import { TERMINAL_BOUNDS } from '../protocol/core.js'
import { isTestOperationDto, isTestProgressEvent, TEST_FINAL_STATES } from '../protocol/tests.js'

/** One tracked operation as the parent displays it. */
export interface TestEntry {
  /** Latest snapshot (state, summary, failure). */
  operation: TestOperationDto
  /** Latest progress while active. */
  progress?: TestProgressDto
  /** Runtime generation that owns the operation. */
  generation: string
  /** Generation was retired before the operation finished; its state is no longer observable. */
  lost: boolean
}

/** Bounds of the parent cache. */
export interface TestsStateLimits {
  /** Finished operations kept. */
  runs: number
  /** Serialized bytes of finished summaries plus cached result pages. */
  bytes: number
}

/** Ordering that keeps late or duplicated events from moving an operation backwards. */
const RANK: Record<TestOperationState, number> = { queued: 0, running: 1, cancelling: 2, completed: 3, failed: 3, cancelled: 3 }

/**
 * Session-lifetime cache of terminal test operations: bounded summaries and
 * fetched result pages. It survives runtime replacement (historical entries
 * stay readable) but never re-executes anything: pages of a retired generation
 * that were not fetched are `unavailable: 'retired'`.
 * @param options Client for page reads, and optional bounds.
 * @param options.client Typed `tests.*` client.
 * @param options.limits Count and byte bounds.
 */
export function createTestsState(options: { client: TestsClient, limits?: TestsStateLimits }) {
  const limits = options.limits ?? { runs: TERMINAL_BOUNDS.testRuns, bytes: TERMINAL_BOUNDS.testBytes }
  const entries = new Map<string, TestEntry>()
  const pages = new Map<string, { operationId: string, page: TestResultsPage, bytes: number }>()
  const listeners = new Set<() => void>()
  const retired = new Set<string>()
  let pageBytes = 0

  /** Notifies subscribers; faulty listeners never break ingestion. */
  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch {}
    }
  }

  /** Drops an entry and everything cached for it. */
  function forget(id: string) {
    entries.delete(id)
    for (const [key, cached] of pages) {
      if (cached.operationId !== id) continue
      pages.delete(key)
      pageBytes -= cached.bytes
    }
  }

  /** Enforces run-count and byte bounds, oldest finished first; active entries are never evicted. */
  function trim() {
    const finished = () => [...entries.values()].filter(entry => TEST_FINAL_STATES.includes(entry.operation.state) || entry.lost)
    const size = () => pageBytes + finished().reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry.operation)), 0)
    while (finished().length > limits.runs) forget(finished()[0].operation.id)
    // Cached pages go before whole summaries: the aggregate is the part worth keeping.
    while (size() > limits.bytes && pages.size) {
      const [key, cached] = pages.entries().next().value!
      pages.delete(key)
      pageBytes -= cached.bytes
    }
    while (size() > limits.bytes && finished().length > 1) forget(finished()[0].operation.id)
  }

  /** Merges a snapshot unless it would move the operation backwards. */
  function ingest(generation: string, operation: TestOperationDto) {
    const known = entries.get(operation.id)
    if (known && RANK[operation.state] < RANK[known.operation.state]) return
    // Map order is eviction order: finishing re-inserts, so a long run is the newest finished entry, not the oldest admitted.
    if (known && TEST_FINAL_STATES.includes(operation.state)) entries.delete(operation.id)
    entries.set(operation.id, { operation, generation, lost: false, progress: TEST_FINAL_STATES.includes(operation.state) ? undefined : known?.progress })
    trim()
    notify()
  }

  const api = {
    /** Feeds one bridge event (`bridge.subscribe` listener); unknown or malformed payloads are ignored. */
    onEvent(generation: string, event: string, data: unknown) {
      if (event === 'tests.state' && isTestOperationDto(data)) {
        ingest(generation, data)
      }
      else if (event === 'tests.progress' && isTestProgressEvent(data)) {
        const entry = entries.get(data.operationId)
        if (!entry || entry.generation !== generation || TEST_FINAL_STATES.includes(entry.operation.state)) return
        entry.progress = data.progress
        notify()
      }
    },
    /** Subscribes to a bridge so events feed this state; returns the unsubscribe function. */
    attach: (bridge: Pick<TerminalBridge, 'subscribe'>) => bridge.subscribe(({ generation, event, data }) => api.onEvent(generation, event, data)),
    /** Marks unfinished operations of a retired generation as lost; finished ones stay as history. */
    onRetired(generation: string) {
      retired.add(generation)
      if (retired.size > 64) retired.delete(retired.values().next().value!)
      let changed = false
      for (const entry of entries.values()) {
        if (entry.generation !== generation || entry.lost || TEST_FINAL_STATES.includes(entry.operation.state)) continue
        entry.lost = true
        entry.progress = undefined
        changed = true
      }
      if (changed) notify()
    },
    /**
     * Reads a result page, caching it. Unfetched pages of a lost or replaced
     * generation are explicitly unavailable instead of being reconstructed.
     */
    async results(operationId: string, page: { cursor?: string, failedOnly?: boolean } = {}): Promise<TestResultsPage> {
      const key = `${operationId}|${page.failedOnly ? 1 : 0}|${page.cursor ?? ''}`
      const cached = pages.get(key)
      if (cached) return cached.page
      const entry = entries.get(operationId)
      if (!entry) return { operationId, unavailable: 'unknown', cases: [], total: 0 }
      if (entry.lost || retired.has(entry.generation)) return { operationId, unavailable: 'retired', cases: [], total: 0 }
      const result = await options.client.results({ operationId, ...page })
      if (!result.unavailable && entries.has(operationId)) {
        const bytes = Buffer.byteLength(JSON.stringify(result))
        pages.set(key, { operationId, page: result, bytes })
        pageBytes += bytes
        trim()
      }
      return result
    },
    /** Tracked operations, oldest first. */
    snapshot: (): TestEntry[] => [...entries.values()],
    /** One tracked operation. */
    get: (operationId: string) => entries.get(operationId),
    /** Subscribes to any change; returns the unsubscribe function. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return api
}

/** State type returned by {@link createTestsState}. */
export type TestsState = ReturnType<typeof createTestsState>
