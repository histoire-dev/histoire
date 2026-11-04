import type { TerminalViewFactory } from './registry.js'
import { logBrowserOptions } from '../logs/browser-options.js'
import { createHistoryBrowser } from '../navigation/browser.js'
import { PHASE_TITLES } from '../progress/format.js'
import { defaultStyle } from '../style.js'

/**
 * `e`: opens the newest retained error in detail. Errors are structured console errors,
 * diagnostics and stderr lines (the stderr fallback); earlier ones stay reachable from the
 * list. A failed startup phase is shown above as structured context. Ordinary stderr never
 * changes the runtime state, this screen only reads history.
 */
export const createErrorView: TerminalViewFactory = (host) => {
  const browser = createHistoryBrowser({
    ...logBrowserOptions(host, record => record.level === 'error'),
    title: 'Latest error',
    noun: 'errors',
    empty: 'No errors',
    startInDetail: true,
    header() {
      const failed = host.progress.snapshot().failed
      return failed ? [defaultStyle().error(`${PHASE_TITLES[failed.phase]} failed${failed.error ? `: ${failed.error}` : ''}`)] : []
    },
  })
  return { id: 'error', shortcut: 'e', title: 'Latest error', ...browser }
}
