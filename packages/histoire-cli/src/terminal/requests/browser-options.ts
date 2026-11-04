import type { HistoryBrowserOptions } from '../navigation/browser.js'
import type { RequestRecord } from '../protocol/requests.js'
import type { TerminalViewHost } from '../views/registry.js'
import { formatDuration } from '../progress/format.js'

/** One-line description of a request, used for rows, search, detail and copy. */
function describeRequest(record: RequestRecord): string {
  return `${record.method} ${record.pathname}  ${record.status ?? 'no response'}  ${record.outcome}  ${formatDuration(record.durationMs)}`
}

/**
 * Adapts the request history to the shared history browser.
 * @param host View host; `requests` is the session history.
 */
export function requestBrowserOptions(host: Pick<TerminalViewHost, 'size' | 'notify' | 'copy' | 'requestRender' | 'requests'>): Pick<HistoryBrowserOptions<RequestRecord>, 'host' | 'items' | 'id' | 'rank' | 'text' | 'label' | 'tone' | 'omitted' | 'subscribe' | 'header'> {
  const history = host.requests
  return {
    host,
    items: () => history.entries(),
    id: record => String(record.id),
    rank: record => record.id,
    text: describeRequest,
    label: record => `#${record.id}`,
    tone: record => record.outcome === 'failed' ? 'error' : record.outcome === 'aborted' ? 'warn' : undefined,
    omitted: () => history.omitted,
    subscribe: listener => history.subscribe(listener),
    header: () => history.inFlight() ? [`\u001B[2m${history.inFlight()} in flight\u001B[22m`] : [],
  }
}
