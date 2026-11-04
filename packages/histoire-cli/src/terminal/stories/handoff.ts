import type { TestTarget } from '../protocol/tests.js'
import type { TerminalViewHost } from '../views/registry.js'

/**
 * Exact test target the stories screen hands to the tests screen (`t`), which then runs it.
 * Handing over never retargets watching, and the child re-validates the IDs against
 * `revision` when a run is admitted.
 */
export interface TestTargetSelection {
  /** Exact story or variant scope (never `all`). */
  target: Extract<TestTarget, { scope: 'story' | 'variant' }>
  /** Display label of the target (sanitize before rendering). */
  label: string
  /** Display label of the owning story when `target` is a variant (the story scope's label). */
  storyLabel?: string
  /** Catalog revision the target was selected in; pass as `expectedRevision` to `tests.run`. */
  revision: string
  /** Runtime generation the target was selected in; a different current generation makes it unresolved. */
  generation: string
}

/** Session-lifetime holder of the latest handed-over target. */
export interface TestTargetHandoff {
  /** Replaces the handed-over target and notifies subscribers. */
  set: (selection: TestTargetSelection) => void
  /** Latest handed-over target, until cleared or replaced. */
  current: () => TestTargetSelection | undefined
  /** Forgets the target. */
  clear: () => void
  /** Observes changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/** Creates an empty handoff. */
export function createTestTargetHandoff(): TestTargetHandoff {
  let selection: TestTargetSelection | undefined
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch {}
    }
  }
  return {
    set(next) {
      selection = next
      notify()
    },
    current: () => selection,
    clear() {
      selection = undefined
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** One handoff per session, shared by views without importing each other. Keyed by the session's bridge. */
const handoffs = new WeakMap<object, TestTargetHandoff>()

/**
 * The session's handoff. The stories screen writes it; the tests screen (slice 08) reads it.
 * @param host View host; only its session-lifetime bridge identifies the session.
 */
export function getTestTargetHandoff(host: Pick<TerminalViewHost, 'bridge'>): TestTargetHandoff {
  let handoff = handoffs.get(host.bridge)
  if (!handoff) handoffs.set(host.bridge, handoff = createTestTargetHandoff())
  return handoff
}
