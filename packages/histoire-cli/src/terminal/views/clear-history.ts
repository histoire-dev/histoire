import type { TerminalViewFactory } from './registry.js'

/**
 * `x`: deletes retained log and request history. Test history and running work are
 * not registered, so they are untouched; the visible console is `c`'s concern.
 */
export const createClearHistoryView: TerminalViewFactory = host => ({
  id: 'clear-history',
  shortcut: 'x',
  title: 'Clear history',
  run: () => host.notify(host.retained.clear().summary),
})
