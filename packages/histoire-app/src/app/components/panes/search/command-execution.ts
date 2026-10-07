import type { HistoireSession } from '@histoire/sdk/internal'
import type { ClientCommand } from '@histoire/shared'
import type { createStandaloneCommands } from '../../../standalone/commands.js'

/** Observe command failures only while their exact pane, source, target and runtime remain current. */
export function createWorkbenchCommandExecutor(session: HistoireSession, commands: () => ReturnType<typeof createStandaloneCommands>, intent: () => number, report: (error: unknown) => void) {
  let active = true
  let generation = 0
  /** Canonical ownership excludes state edits made by the command itself. */
  function ownerKey() {
    const snapshot = session.getSnapshot()
    return JSON.stringify([snapshot.status, snapshot.stale, snapshot.source?.sourceId, snapshot.source?.epoch, snapshot.source?.revision, snapshot.selection, snapshot.runtime.status, snapshot.runtime.runtimeId])
  }
  let owner = ownerKey()
  const stop = session.subscribe(() => {
    const next = ownerKey()
    // Retire once even if navigation returns to the same target before rejection.
    if (owner !== next) generation++
    owner = next
  })
  return {
    /** Submission captures ownership before invoking the existing transport adapter. */
    execute(command: ClientCommand, params: Record<string, any>) {
      const capturedGeneration = ++generation
      const capturedIntent = intent()
      const ownsExecution = commands().captureExecutionOwner?.() ?? (() => true)
      /** Query retirement and canonical owner changes both suppress abandoned failures. */
      const ownsFeedback = () => active && capturedGeneration === generation && capturedIntent === intent() && ownsExecution()
      try {
        void commands().execute(command, params).catch((error) => {
          if (ownsFeedback()) report(error)
        })
      }
      catch (error) { if (ownsFeedback()) report(error) }
    },
    /** Provider retirement observes outstanding promises while removing its subscription. */
    close() {
      active = false
      stop()
    },
  }
}
