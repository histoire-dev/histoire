import type { TestsEntry, TestsService } from '@histoire/plugin-kit'
import type { WorkbenchTestsModel } from '../components/panes/tests/model.js'
import { watch } from 'vue'

/** Readable message of a variant failure kept by the project tests model. */
function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null
  return error instanceof Error ? error.message : String(error)
}

/**
 * Exposes the project tests model (the one behind the Tests pane) to plugins, so plugin runs
 * share its results and execution lane. Must run inside the workbench effect scope; the watcher
 * stops with it.
 * @param model Project tests model of the standalone workbench.
 */
export function createTestsService(model: WorkbenchTestsModel): TestsService {
  const listeners = new Set<() => void>()
  // Entries are replaced as a whole on every publication, so the projection is cached per map.
  let source: WorkbenchTestsModel['entries']['value'] | undefined
  let projected: readonly TestsEntry[] = []
  watch([model.entries, model.running, model.canRun, model.completed, model.total, model.runProgress, model.error], () => {
    for (const listener of [...listeners]) listener()
  })
  return Object.freeze({
    entries() {
      if (source !== model.entries.value) {
        source = model.entries.value
        projected = [...source.values()].map((entry): TestsEntry => ({
          target: entry.target,
          // Plain summaries are assignable to their readonly view; the cast avoids deep instantiation.
          summary: entry.summary as unknown as TestsEntry['summary'],
          running: entry.running,
          stale: entry.stale,
          error: errorMessage(entry.error),
        }))
      }
      return projected
    },
    get running() {
      return model.running.value
    },
    get canRun() {
      return model.canRun.value
    },
    get progress() {
      if (!model.running.value) return null
      // Server-reported phases are finer than per-job target counts; before either moves, the
      // amount of work done is unknown.
      if (model.runProgress.value) return model.runProgress.value
      return model.completed.value > 0 ? { phase: 'run' as const, completed: model.completed.value, total: model.total.value } : null
    },
    get error() {
      return errorMessage(model.error.value)
    },
    runAll: () => model.runAll(),
    run: target => model.run(target),
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  })
}
