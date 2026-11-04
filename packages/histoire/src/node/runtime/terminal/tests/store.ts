import type { TestCaseDto, TestOperationDto, TestUnavailableReason } from '@histoire/cli/protocol/tests'
import { TERMINAL_BOUNDS } from '@histoire/cli/protocol/core'
import { jsonBytes } from './projection.js'

/** Retention bounds of completed operations. */
export interface StoreLimits {
  /** Completed operations kept. */
  runs: number
  /** Serialized bytes of completed summaries plus retained cases. */
  bytes: number
}

/** Frozen defaults from the retention contract. */
export const DEFAULT_STORE_LIMITS: StoreLimits = { runs: TERMINAL_BOUNDS.testRuns, bytes: TERMINAL_BOUNDS.testBytes }

/** Remembered evicted IDs, so an evicted read is distinguishable from an unknown one. */
const TOMBSTONES = 256

/** One retained finished operation. */
interface Entry {
  operation: TestOperationDto
  cases: TestCaseDto[]
  bytes: number
}

/**
 * Bounded history of finished operations. Active operations are never stored
 * here, so they cannot be evicted as if they were completed results. The
 * newest entry always survives its own insertion; older ones go first.
 * @param limits Count and byte bounds.
 */
export function createResultStore(limits: StoreLimits = DEFAULT_STORE_LIMITS) {
  const entries = new Map<string, Entry>()
  const evicted = new Set<string>()
  let bytes = 0

  /** Drops oldest entries until both bounds hold (the newest is kept). */
  function trim() {
    while (entries.size > 1 && (entries.size > limits.runs || bytes > limits.bytes)) {
      const [id, entry] = entries.entries().next().value!
      entries.delete(id)
      bytes -= entry.bytes
      evicted.add(id)
      if (evicted.size > TOMBSTONES) evicted.delete(evicted.values().next().value!)
    }
  }

  return {
    /**
     * Stores (or replaces) a finished operation with its retained cases.
     * @param operation Final snapshot.
     * @param cases Retained case results.
     * @param caseBytes Serialized size of `cases`.
     */
    put(operation: TestOperationDto, cases: TestCaseDto[], caseBytes: number) {
      const previous = entries.get(operation.id)
      if (previous) bytes -= previous.bytes
      entries.delete(operation.id)
      const size = caseBytes + jsonBytes(operation)
      entries.set(operation.id, { operation, cases, bytes: size })
      bytes += size
      trim()
    },
    /** Final snapshot of a retained operation. */
    operation: (id: string) => entries.get(id)?.operation,
    /** Retained cases of a finished operation. */
    cases: (id: string) => entries.get(id)?.cases,
    /** Why a finished operation cannot be read, when it cannot. */
    missing(id: string): TestUnavailableReason | undefined {
      return entries.has(id) ? undefined : evicted.has(id) ? 'evicted' : 'unknown'
    },
    /** Retained entry count. */
    get size() {
      return entries.size
    },
    /** Retained serialized bytes. */
    get bytes() {
      return bytes
    },
  }
}

/** Store type returned by {@link createResultStore}. */
export type ResultStore = ReturnType<typeof createResultStore>
