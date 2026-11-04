/** One session history that `x` can delete (logs, and requests once slice 06 registers them). */
export interface RetainedHistory {
  /** Stable key; registering the same key again replaces the earlier entry. */
  id: string
  /** Plural noun for feedback, e.g. `log entries`. */
  label: string
  /** Number of retained entries. */
  count: () => number
  /** Deletes the retained entries. Must not touch test history or running work. */
  clear: () => void
}

/** Result of deleting retained histories. */
export interface RetainedClearResult {
  /** Feedback sentence, e.g. `Deleted 12 log entries, 3 requests`. */
  summary: string
  /** Total entries deleted. */
  deleted: number
}

/** Registry of deletable histories shared by the session and views (`x` key). */
export interface RetainedHistories {
  /** Adds (or replaces) a history; returns a remover. */
  register: (history: RetainedHistory) => () => void
  /** Deletes every registered history and describes what was deleted. */
  clear: () => RetainedClearResult
}

/** Creates an empty registry. */
export function createRetainedHistories(): RetainedHistories {
  const histories = new Map<string, RetainedHistory>()
  return {
    register(history) {
      histories.set(history.id, history)
      return () => void (histories.get(history.id) === history && histories.delete(history.id))
    },
    clear() {
      const parts: string[] = []
      let deleted = 0
      for (const history of histories.values()) {
        const count = history.count()
        history.clear()
        deleted += count
        parts.push(`${count} ${history.label}`)
      }
      return { deleted, summary: deleted ? `Deleted ${parts.join(', ')}` : 'No retained history to delete' }
    },
  }
}
