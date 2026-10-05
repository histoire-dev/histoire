import { HistoireSdkError } from '../types/error.js'

/** One controls document owns revision counter; source wrapper keeps admitted watermark. */
export function createControlsStateRevision() {
  let revision = 0
  /** Optional legacy field remains valid; present revisions must be finite counters. */
  function valid(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  }
  return {
    /** Last captured local edit or admitted child edit for this document only. */
    get current(): number { return revision },
    /** Stamp edit before asynchronous postMessage can cross wrapper boundary. */
    capture(): number {
      if (revision === Number.MAX_SAFE_INTEGER) throw new HistoireSdkError('INVALID_ARGUMENT', 'Controls revision exhausted')
      return ++revision
    },
    /** Admit each child edit once, rejecting replay and malformed counters. */
    receive(value: unknown): boolean {
      if (value === undefined) return true
      if (!valid(value) || value <= revision) return false
      revision = value
      return true
    },
    /** New typing already captured locally makes older acknowledgment inapplicable. */
    accept(value: unknown): boolean {
      return value === undefined || (valid(value) && value === revision)
    },
  }
}
