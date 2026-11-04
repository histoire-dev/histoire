import type { ResultRow } from '../tests/results.js'
import type { TerminalViewFactory } from './registry.js'
import { createHistoryBrowser } from '../navigation/browser.js'
import { buildTestsHeader, describeEmptyResults, describeResultsStatus, TESTS_FOOTER } from '../tests/header.js'
import { createResultsList, describeCase } from '../tests/results.js'

/** Rows from the end of the loaded cases at which the next page is requested. */
const LOAD_AHEAD = 10

/** Row label of a case state. */
const LABELS = { failed: 'FAIL', passed: 'pass', skipped: 'skip' } as const

/**
 * `t`: run and inspect browser tests. Left/Right pick All, Story or Variant (the latter two
 * come from the story browser's `t` and are disabled while unresolved), `r` runs the
 * selected scope, Enter opens the selected case, `s` stops, `f` filters failures, `[`/`]` step through retained runs by
 * ID. Cases of the shown run are paged and use the shared list/search/detail/copy browser;
 * totals, uncollected stories and run errors come from the summary, not from loaded pages.
 */
export const createTestsView: TerminalViewFactory = (host) => {
  const { tests } = host
  const results = createResultsList(tests)
  host.addPanelSegment(() => tests.segment())
  const browser = createHistoryBrowser<ResultRow>({
    host,
    title: 'Tests',
    noun: 'cases',
    items: () => results.rows(),
    id: row => row.id,
    rank: row => row.rank,
    text: row => describeCase(row.case),
    label: row => LABELS[row.case.state],
    tone: row => row.case.state === 'failed' ? 'error' : row.case.state === 'skipped' ? 'dim' : undefined,
    omitted: () => tests.viewed()?.operation.summary?.omittedCases ?? 0,
    subscribe: results.subscribe,
    header: () => buildTestsHeader(tests, results),
    status: shown => describeResultsStatus(tests, results, shown),
    empty: () => describeEmptyResults(tests, results),
    follow: false,
    footer: TESTS_FOOTER,
  })
  let unsubscribe: (() => void) | undefined

  /** Requests the next page when the cursor nears the end of what is loaded. */
  function loadAhead() {
    const rows = results.rows()
    const index = rows.findIndex(row => row.id === browser.navigation.selectedId())
    if (results.hasMore() && index >= rows.length - LOAD_AHEAD) results.loadMore()
  }

  /** `r`: submits the selected scope and shows why nothing was admitted. */
  function run() {
    void tests.run().then(result => 'problem' in result ? host.notify(result.problem) : host.notify('Tests queued'))
  }

  /** `s`: stops terminal work and says what was asked. */
  function stop() {
    void tests.stop().then(host.notify)
  }

  /** Move the scope or tell why it cannot move. */
  function moveScope(direction: 1 | -1) {
    if (tests.moveScope(direction)) return
    host.notify(tests.runnable().available ? 'No other scope available' : (tests.runnable().reason ?? 'Scope unavailable'))
  }

  /** Screen keys by key name (arrows) or typed character; Enter falls through to the browser, which opens the selected case. */
  const keyActions: Record<string, () => void> = {
    'left': () => moveScope(-1),
    'right': () => moveScope(1),
    'r': run,
    's': stop,
    'f': () => results.setFailuresOnly(!results.failuresOnly()),
    'w': () => void tests.toggleWatch().then(host.notify),
    '[': () => tests.moveViewed(1),
    ']': () => tests.moveViewed(-1),
  }

  return {
    id: 'tests',
    shortcut: 't',
    title: 'Tests',
    enter() {
      results.sync()
      browser.enter()
      // Operation events, progress, scope and generation changes all repaint the screen.
      unsubscribe = tests.subscribe(() => {
        results.sync()
        host.requestRender()
      })
    },
    leave() {
      unsubscribe?.()
      unsubscribe = undefined
      browser.leave()
    },
    capturesInput: browser.capturesInput,
    handleKey(key) {
      // Detail and search own every key, including the ones used here.
      if (browser.detailOpen() || browser.search.active()) return browser.handleKey(key)
      const action = Object.hasOwn(keyActions, key.char ?? key.name) ? keyActions[key.char ?? key.name] : undefined
      if (action) {
        action()
        return true
      }
      if (!browser.handleKey(key)) return false
      loadAhead()
      return true
    },
    render: size => browser.render(size),
  }
}
