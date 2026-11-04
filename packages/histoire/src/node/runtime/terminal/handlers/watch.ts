import type { TerminalCommandHandler } from '../registry.js'
import { parseWatchSetArgs } from '@histoire/cli/protocol/watch'
import { getWatchScheduler, hasWatchScheduler } from '../watch/index.js'

/**
 * Handlers of the `watch.*` namespace. The reply is the state right after the
 * request was applied; cleanup of cancelled work continues in the background
 * and is reported through `tests.state`/`watch.state` events, so disabling
 * never waits on a held browser.
 */
export const watchHandlers: readonly TerminalCommandHandler[] = [
  {
    operation: 'watch.set',
    async handle(args, context) {
      const request = parseWatchSetArgs(args)
      if (!request.enabled && !hasWatchScheduler(context)) return { enabled: false, phase: 'off', pending: 0, runs: 0 }
      return getWatchScheduler(context).set(request)
    },
  },
]
