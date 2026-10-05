import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'

/** Ready passive runtime that can remain visible after canonical selection changes. */
export interface CanvasReplicaCandidate extends HistoireTarget {
  /** Stable frame registration key. */
  id: string
  /** Isolated mounted runtime matching this exact frame. */
  session: HistoireSession
}

/** Owns one canvas-only promotion without transferring SDK mount ownership. */
export interface CanvasReplicaPromotionOptions {
  /** Fully releases canonical primary before its route selection is changed. */
  detachPrimary: () => Promise<void>
  /** Recreates canonical primary after a non-replica selection. */
  restorePrimary: () => void
  /** Updates canonical route and selection through the owning standalone session. */
  select: (target: HistoireTarget) => Promise<void>
  /** Publishes promoted replica for frame retention and inspector scoping. */
  active: (frame: CanvasReplicaCandidate | undefined) => void
  /** Reads canonical selection after asynchronous route work settles. */
  current?: () => HistoireTarget | null | undefined
  /** Reports only active transition failures through the workbench boundary. */
  error: (error: unknown) => void
}

/** Compare opaque collected target identities without conflating frame keys. */
function sameTarget(left: HistoireTarget | null | undefined, right: HistoireTarget | null | undefined): boolean {
  return left?.storyId === right?.storyId && left?.variantId === right?.variantId
}

/** Serialize primary handoff so rapid labels cannot recreate competing runtimes. */
export function createCanvasReplicaPromotion(options: CanvasReplicaPromotionOptions) {
  let active: CanvasReplicaCandidate | undefined
  let pending: HistoireTarget | undefined
  let previous: HistoireTarget | null | undefined
  let detached = false
  let closed = false
  let generation = 0
  let queue = Promise.resolve()

  /** Queue work while retaining an observed rejection for its initiating caller. */
  function schedule(task: () => Promise<void>): Promise<void> {
    const operation = queue.then(task)
    queue = operation.catch(() => {})
    return operation
  }

  /** Publish only identity-validated active runtime changes. */
  function setActive(frame: CanvasReplicaCandidate | undefined): void {
    active = frame
    options.active(frame)
  }

  /** Detach exactly once; primary must be absent before route selection can preserve replica DOM. */
  async function detach(): Promise<void> {
    if (detached) return
    await options.detachPrimary()
    detached = true
  }

  /** End replica mode without retaining a delayed frame/session reference. */
  function restore(): void {
    pending = undefined
    previous = undefined
    setActive(undefined)
    if (detached) {
      detached = false
      options.restorePrimary()
    }
  }

  return {
    /** Current retained selected frame key, if canvas is displaying a replica. */
    get frameId(): string | undefined {
      return active?.id
    },
    /** Keep existing ready iframe and make its session own inspector operations. */
    promote(frame: CanvasReplicaCandidate): Promise<void> {
      const token = ++generation
      previous = options.current?.()
      pending = { storyId: frame.storyId, variantId: frame.variantId }
      return schedule(async () => {
        if (closed || token !== generation) return
        try {
          await detach()
          if (closed || token !== generation) return
          setActive(frame)
          await options.select({ storyId: frame.storyId, variantId: frame.variantId })
          if (closed || token !== generation) return
          pending = undefined
          previous = undefined
          // A competing route may win while its own navigation promise settles.
          if (options.current && !sameTarget(options.current(), frame)) restore()
        }
        catch (error) {
          if (closed || token !== generation) return
          restore()
          options.error(error)
        }
      })
    },
    /** Select an unready/paused target, then restore canonical primary ownership. */
    selectCanonical(target: HistoireTarget): Promise<void> {
      const token = ++generation
      previous = options.current?.()
      pending = target
      return schedule(async () => {
        if (closed || token !== generation) return
        try {
          if (active || detached) {
            setActive(undefined)
            await detach()
            if (closed || token !== generation) return
            await options.select(target)
            if (closed || token !== generation) return
            pending = undefined
            previous = undefined
            restore()
            return
          }
          await options.select(target)
          if (token === generation) {
            pending = undefined
            previous = undefined
          }
        }
        catch (error) {
          if (closed || token !== generation) return
          restore()
          options.error(error)
        }
      })
    },
    /** External route/source changes cannot leave inspector bound to retired replica. */
    synchronize(target: HistoireTarget | null | undefined, stale: boolean): void {
      // Canonical selection publishes synchronously, so accept only the exact
      // pending target. A different target supersedes this transition.
      if (pending && !stale && sameTarget(target, pending)) return
      // Primary teardown can publish its previously selected target before the
      // queued route selection starts. It is not an external navigation.
      if (pending && !stale && !active && !detached && sameTarget(target, previous)) return
      if (!active && !detached && !pending) return
      if (stale || (pending && !sameTarget(target, pending)) || (active && !sameTarget(target, active))) {
        generation++
        restore()
      }
    },
    /** Component teardown retires queued promotion before a late primary release. */
    close(): void {
      closed = true
      generation++
      pending = undefined
      previous = undefined
      setActive(undefined)
    },
  }
}
