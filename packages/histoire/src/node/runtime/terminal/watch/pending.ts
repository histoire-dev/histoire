import type { AffectedChange } from '../affected/types.js'
import { AFFECTED_REASON_ORDER } from '../affected/types.js'

/** Work taken out of the pending set for one admission attempt. */
export interface PendingClaim {
  /** Classified edits, in event order. */
  changes: AffectedChange[]
  /** Story IDs of an interrupted batch that never produced a result. */
  carried: string[]
  /** The whole selected scope still has to run (initial run or interrupted scope run). */
  whole: boolean
}

/** Edits kept individually before they are merged into one change. */
const MAX_CHANGES = 1000

/** Merges changes into one that selects the union (used only past the memory bound). */
function mergeChanges(changes: AffectedChange[]): AffectedChange {
  const reasons = AFFECTED_REASON_ORDER.filter(reason => changes.some(change => change.reason === reason))
  return {
    event: 'merged',
    file: '',
    reason: reasons[0] ?? 'ignored',
    storyIds: [...new Set(changes.flatMap(change => change.storyIds))],
    proven: [...new Set(changes.flatMap(change => change.proven))],
    whole: changes.some(change => change.whole),
    conservative: changes.some(change => change.conservative),
    seq: Math.max(...changes.map(change => change.seq)),
  }
}

/**
 * The next run's inputs: classified edits plus targets an interrupted run left
 * unvalidated. Admission claims the whole set in one synchronous step and puts
 * it back when admission is refused, so an edit can never be lost between
 * being noticed and being run, and nothing runs twice.
 */
export function createPendingSet() {
  let changes: AffectedChange[] = []
  const carried = new Set<string>()
  let whole = false

  return {
    /** Records one classified edit. */
    add(change: AffectedChange) {
      changes.push(change)
      if (changes.length > MAX_CHANGES) changes = [mergeChanges(changes)]
    },
    /** Keeps story IDs of an interrupted batch for the successor. */
    carry(ids: Iterable<string>) {
      for (const id of ids) carried.add(id)
    },
    /** Marks the whole selected scope as still owed. */
    carryWhole() {
      whole = true
    },
    /** Takes everything and leaves the set empty. */
    claim(): PendingClaim {
      const claim = { changes, carried: [...carried], whole }
      changes = []
      carried.clear()
      whole = false
      return claim
    },
    /** Puts a refused claim back in front of edits that arrived meanwhile. */
    restore(claim: PendingClaim) {
      changes = [...claim.changes, ...changes].sort((left, right) => left.seq - right.seq)
      for (const id of claim.carried) carried.add(id)
      whole ||= claim.whole
    },
    /** Forgets everything (scope change, disable). */
    clear() {
      changes = []
      carried.clear()
      whole = false
    },
    /** Nothing is owed. */
    get empty() {
      return !changes.length && !carried.size && !whole
    },
    /** Distinct story IDs waiting (the whole-scope token counts as none). */
    get size() {
      return new Set([...carried, ...changes.flatMap(change => change.storyIds)]).size
    },
  }
}

/** Pending set type. */
export type PendingSet = ReturnType<typeof createPendingSet>
