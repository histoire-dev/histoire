import type { TerminalCommandHandler } from '../registry.js'
import { catalogHandlers } from './catalog.js'
import { diagnosticsHandlers } from './diagnostics.js'
import { sessionHandlers } from './session.js'
import { testHandlers } from './tests.js'
import { watchHandlers } from './watch.js'

/**
 * The only shared handler list. A domain slice adds one import of its module's
 * handler array and one spread entry here, and edits nothing else in the adapter.
 */
export const terminalHandlers: readonly TerminalCommandHandler[] = [
  ...catalogHandlers,
  ...sessionHandlers,
  ...diagnosticsHandlers,
  ...testHandlers,
  ...watchHandlers,
]
