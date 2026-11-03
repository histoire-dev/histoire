import type { Disposer, WorkbenchPluginApi } from '@histoire/plugin-kit'
import type { HistoireTarget } from '@histoire/protocol'
import type { A11yResult } from './sources.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { A11Y_BUILD_REPORT_FILE } from '../results.js'
import { parseBuildReport, resultsFromTests } from './sources.js'

/** Observable state of the project pane source. */
export interface ProjectSourceState {
  /** Results of the latest run or of the build report. */
  results: readonly A11yResult[]
  /** `tests` while the dev server runs checks, `build` for a static report, `none` otherwise. */
  kind: 'tests' | 'build' | 'none'
  /** A run (or the report download) is in progress. */
  running: boolean
  /** Checks can start now. */
  canRun: boolean
  /** Progress of the current run, when the host reports it. */
  progress: { phase: 'queued' | 'collect' | 'run', completed: number, total: number } | null
  /** ISO time of the build report. */
  generatedAt?: string
  /** Report download failure, or failure of the latest run as a whole (first line). */
  error?: string
}

/**
 * Picks the pane data source: live project test runs on the dev server, else the report the
 * `build` option embedded into the static book. Disposed with the plugin.
 * @param api Workbench plugin API.
 * @param options Whether the `test` and `build` options are enabled.
 * @param options.tests Accessibility tests are registered.
 * @param options.report The book embeds a build report.
 */
export function createProjectSource(api: WorkbenchPluginApi, options: { tests: boolean, report: boolean }) {
  const tests = options.tests ? api.context.tests : undefined
  const listeners = new Set<() => void>()
  let state: ProjectSourceState = { results: [], kind: tests ? 'tests' : options.report ? 'build' : 'none', running: false, canRun: false, progress: null }

  /** Publish a new state to views and refresh the rail badge. */
  function update(patch: Partial<ProjectSourceState>): void {
    if (api.signal.aborted) return
    state = { ...state, ...patch }
    for (const listener of [...listeners]) listener()
    api.invalidate()
  }

  if (tests) {
    const read = () => update({ results: resultsFromTests(tests.entries()), running: tests.running, canRun: tests.canRun, progress: tests.progress, error: tests.error?.split('\n')[0] || undefined })
    tests.subscribe(read)
    read()
  }
  else if (options.report) {
    void loadReport()
  }

  /** Download the build report next to the book entry; a missing file means no results. */
  async function loadReport(): Promise<void> {
    update({ running: true })
    try {
      const url = new URL(`${import.meta.env.BASE_URL}${A11Y_BUILD_REPORT_FILE}`, document.baseURI)
      const response = await fetch(url, { signal: api.signal })
      if (response.status === 404) return update({ running: false })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const report = parseBuildReport(await response.json())
      if (!report) throw new Error('Invalid accessibility report')
      update({ running: false, results: report.results, generatedAt: report.generatedAt })
    }
    catch (error) {
      if (!api.signal.aborted) update({ running: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    /** Current state; replaced on every change. */
    get: () => state,
    /** Observe state changes. */
    subscribe(listener: () => void): Disposer {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Run accessibility checks of every variant (with the rest of the project tests). */
    runAll(): void {
      if (tests?.canRun) void tests.runAll().catch(api.reportError)
    },
  }
}

/** Source type passed to the pane view. */
export type ProjectSource = ReturnType<typeof createProjectSource>

/**
 * Report of one variant in the source's latest results. The index is rebuilt only when the
 * results change, since frame header badges read it for every laid-out frame.
 * @param source Project source.
 */
export function createReportLookup(source: ProjectSource): (target: HistoireTarget) => A11yResult['report'] {
  let indexed: readonly A11yResult[] | undefined
  let index = new Map<string, A11yResult['report']>()
  return (target) => {
    const { results } = source.get()
    if (results !== indexed) {
      indexed = results
      index = new Map(results.map(result => [getHistoireTargetKey(result.target), result.report]))
    }
    return index.get(getHistoireTargetKey(target))
  }
}
