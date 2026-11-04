import type { TerminalViewFactory } from './registry.js'
import { attachDiagnostics } from '../diagnostics/attach.js'
import { createHistoryBrowser } from '../navigation/browser.js'
import { requestBrowserOptions } from '../requests/browser-options.js'

/**
 * `n`: public HTTP requests (method, pathname, status, outcome, duration), newest followed,
 * searchable, with detail and copy. Also registers the history with `x` and contributes the
 * runtime diagnostics block to the session screen and panel (the view is the domain's
 * session-lifetime entry point).
 */
export const createRequestsView: TerminalViewFactory = (host) => {
  host.retained.register({ id: 'requests', label: 'requests', count: () => host.requests.entries().length, clear: () => host.requests.clear() })
  attachDiagnostics(host)
  const browser = createHistoryBrowser({ ...requestBrowserOptions(host), title: 'Requests', noun: 'requests', empty: 'No requests yet' })
  return { id: 'requests', shortcut: 'n', title: 'Requests', ...browser }
}
