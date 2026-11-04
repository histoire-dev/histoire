import type { HistoryBrowserOptions } from '../navigation/browser.js'
import type { LogHistory, LogRecord } from '../output/history.js'
import type { TerminalViewHost } from '../views/registry.js'

/**
 * Browser options shared by every screen over the session log history (logs, latest error).
 * @param host View host; `logs` is the session history.
 * @param filter Keeps only the records the screen shows.
 */
export function logBrowserOptions(host: Pick<TerminalViewHost, 'size' | 'notify' | 'copy' | 'requestRender' | 'logs'>, filter: (record: LogRecord) => boolean = () => true): Pick<HistoryBrowserOptions<LogRecord>, 'host' | 'items' | 'id' | 'rank' | 'text' | 'label' | 'tone' | 'omitted' | 'subscribe'> {
  const history: LogHistory = host.logs
  return {
    host,
    items: () => history.entries().filter(filter),
    id: record => String(record.id),
    rank: record => record.id,
    text: record => record.truncated ? `${record.text} … (${record.truncated} characters cut)` : record.text,
    label: record => `#${record.id} ${record.source === 'diagnostic' ? 'histoire' : record.source}`,
    tone: record => record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : record.level === 'debug' ? 'dim' : undefined,
    omitted: () => history.omitted,
    subscribe: listener => history.subscribe(listener),
  }
}
