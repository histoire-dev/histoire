import type { TerminalViewFactory } from './registry.js'
import { logBrowserOptions } from '../logs/browser-options.js'
import { createHistoryBrowser } from '../navigation/browser.js'

/** `l`: every retained log entry, newest followed, searchable, with detail and copy. */
export const createLogsView: TerminalViewFactory = (host) => {
  const browser = createHistoryBrowser({ ...logBrowserOptions(host), title: 'Logs', noun: 'log entries', empty: 'No log entries' })
  return { id: 'logs', shortcut: 'l', title: 'Logs', ...browser }
}
