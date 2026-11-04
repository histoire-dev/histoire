/** Entry of a bounded history: carries the stable session identifier. */
export interface HistoryEntry {
  /** Stable, strictly increasing session identifier (survives eviction, clearing and restarts). */
  id: number
}

/** Retention bounds of a history. */
export interface HistoryLimits<T> {
  /** Most entries retained. */
  entries: number
  /** Most retained weight (e.g. UTF-8 bytes); needs `weigh`. */
  maxWeight?: number
  /** Cost of one entry against `maxWeight`. */
  weigh?: (entry: T) => number
}

/** Session-lifetime history bounded by entry count and optional weight. */
export interface BoundedHistory<T extends HistoryEntry> {
  /** Assigns the next identifier, retains the built entry and evicts oldest ones beyond the bounds. */
  append: (build: (id: number) => T) => T
  /** Currently retained entries, oldest first. */
  entries: () => readonly T[]
  /** Number of entries evicted by bounds since the session began (not by `clear`). */
  readonly omitted: number
  /** Retained weight. */
  readonly weight: number
  /** Deletes retained entries; identifiers keep increasing. */
  clear: () => void
  /** Notifies after each append or clear; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
  /** Notifies listeners without changing entries (state kept next to the history changed). */
  touch: () => void
}

/**
 * Creates the retention core shared by log and request histories: stable increasing IDs,
 * oldest-first eviction with an omission count, and fault-isolated change listeners.
 * @param limits Entry and optional weight bounds.
 */
export function createBoundedHistory<T extends HistoryEntry>(limits: HistoryLimits<T>): BoundedHistory<T> {
  const weigh = limits.weigh ?? (() => 0)
  const maxWeight = limits.maxWeight ?? Number.POSITIVE_INFINITY
  const records: T[] = []
  const listeners = new Set<() => void>()
  let nextId = 1
  let weight = 0
  let omitted = 0

  /** Listener faults must not break the producer. */
  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch {}
    }
  }

  return {
    get omitted() {
      return omitted
    },
    get weight() {
      return weight
    },
    append(build) {
      const record = build(nextId++)
      records.push(record)
      weight += weigh(record)
      // Always keep the newest entry, even if it alone exceeds the weight bound.
      while (records.length > 1 && (records.length > limits.entries || weight > maxWeight)) {
        weight -= weigh(records.shift()!)
        omitted++
      }
      notify()
      return record
    },
    entries: () => records,
    clear() {
      records.length = 0
      weight = 0
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    touch: notify,
  }
}
